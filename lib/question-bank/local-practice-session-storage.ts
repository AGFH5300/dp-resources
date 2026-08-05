import type { PracticeConfiguration } from './practice-configuration';

export type LocalPracticeQueueTuple = [
  questionId: string,
  variantId: string,
  primaryBlockKey: string,
  matchedBlockKeys: string[],
];

export type LocalPracticeSession = {
  id: string;
  userId: string;
  schemaVersion: 1;
  configuration: PracticeConfiguration;
  generationSeed: string;
  orderingMode: PracticeConfiguration['orderingMode'];
  totalCount: number;
  storedCount: number;
  chunkSize: number;
  currentPosition: number;
  status: 'building' | 'generated' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
};

export type LocalPracticeQueueChunk = {
  sessionId: string;
  startPosition: number;
  itemCount: number;
  items: LocalPracticeQueueTuple[];
};

export type LocalPracticePageItem = {
  position: number;
  questionId: string;
  variantId: string;
  primaryBlockKey: string;
  matchedBlockKeys: string[];
};

const DATABASE_NAME = 'dp-resources-question-bank-local';
const DATABASE_VERSION = 1;
const SESSION_STORE = 'practiceSessions';
const QUEUE_STORE = 'practiceQueueChunks';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUILDING_MAX_AGE_MS = 60 * 60 * 1000;
const GENERATED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const IN_PROGRESS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const COMPLETED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_USER = 8;

let databasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('Browser practice storage failed.'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error || new Error('Browser practice storage was aborted.'));
    transaction.onerror = () =>
      reject(transaction.error || new Error('Browser practice storage failed.'));
  });
}

function openDatabase() {
  if (typeof window === 'undefined' || !window.indexedDB)
    return Promise.reject(
      new Error(
        'This browser does not provide local practice storage. Try a current browser with private browsing disabled.',
      ),
    );
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        const sessions = database.createObjectStore(SESSION_STORE, {
          keyPath: 'id',
        });
        sessions.createIndex('userId', 'userId', { unique: false });
        sessions.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        const chunks = database.createObjectStore(QUEUE_STORE, {
          keyPath: ['sessionId', 'startPosition'],
        });
        chunks.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('Unable to open browser practice storage.'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(
        new Error(
          'Browser practice storage is blocked by another open DP Resources tab. Close older tabs and try again.',
        ),
      );
    };
  });
  return databasePromise;
}

function validTuple(value: unknown): value is LocalPracticeQueueTuple {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    typeof value[0] === 'string' &&
    UUID.test(value[0]) &&
    typeof value[1] === 'string' &&
    UUID.test(value[1]) &&
    typeof value[2] === 'string' &&
    value[2].length >= 1 &&
    value[2].length <= 100 &&
    Array.isArray(value[3]) &&
    value[3].length >= 1 &&
    value[3].every(
      (key) => typeof key === 'string' && key.length >= 1 && key.length <= 100,
    )
  );
}

function sessionExpiry(session: LocalPracticeSession) {
  if (session.status === 'building') return BUILDING_MAX_AGE_MS;
  if (session.status === 'generated') return GENERATED_MAX_AGE_MS;
  if (session.status === 'completed') return COMPLETED_MAX_AGE_MS;
  return IN_PROGRESS_MAX_AGE_MS;
}

async function deleteChunkEntries(
  store: IDBObjectStore,
  sessionId: string,
) {
  await new Promise<void>((resolve, reject) => {
    const request = store.index('sessionId').openCursor(IDBKeyRange.only(sessionId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
    request.onerror = () =>
      reject(request.error || new Error('Unable to remove local practice queue.'));
  });
}

export async function discardLocalPracticeSession(
  sessionId: string,
  userId?: string,
) {
  if (!UUID.test(sessionId)) return false;
  const database = await openDatabase();
  const transaction = database.transaction(
    [SESSION_STORE, QUEUE_STORE],
    'readwrite',
  );
  const sessions = transaction.objectStore(SESSION_STORE);
  const session = (await requestResult(
    sessions.get(sessionId),
  )) as LocalPracticeSession | undefined;
  if (!session || (userId && session.userId !== userId)) {
    transaction.abort();
    return false;
  }
  sessions.delete(sessionId);
  await deleteChunkEntries(transaction.objectStore(QUEUE_STORE), sessionId);
  await transactionDone(transaction);
  return true;
}

export async function beginLocalPracticeSession(
  session: Omit<
    LocalPracticeSession,
    'storedCount' | 'currentPosition' | 'status' | 'updatedAt' | 'lastOpenedAt'
  >,
) {
  if (!UUID.test(session.id) || !UUID.test(session.userId))
    throw new Error('The local practice session identifier is invalid.');
  if (
    !Number.isInteger(session.totalCount) ||
    session.totalCount < 1 ||
    !Number.isInteger(session.chunkSize) ||
    session.chunkSize < 1 ||
    session.chunkSize > 10_000
  )
    throw new Error('The local practice session size is invalid.');

  await discardLocalPracticeSession(session.id).catch(() => false);
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, 'readwrite');
  const now = new Date().toISOString();
  transaction.objectStore(SESSION_STORE).put({
    ...session,
    storedCount: 0,
    currentPosition: 0,
    status: 'building',
    updatedAt: now,
    lastOpenedAt: null,
  } satisfies LocalPracticeSession);
  await transactionDone(transaction);
}

export async function appendLocalPracticeQueueChunk(
  chunk: LocalPracticeQueueChunk,
  userId: string,
) {
  if (
    !UUID.test(chunk.sessionId) ||
    !Number.isInteger(chunk.startPosition) ||
    chunk.startPosition < 0 ||
    !Number.isInteger(chunk.itemCount) ||
    chunk.itemCount < 1 ||
    chunk.itemCount > 10_000 ||
    chunk.items.length !== chunk.itemCount ||
    !chunk.items.every(validTuple)
  )
    throw new Error('The local practice queue chunk is invalid.');

  const database = await openDatabase();
  const transaction = database.transaction(
    [SESSION_STORE, QUEUE_STORE],
    'readwrite',
  );
  const sessions = transaction.objectStore(SESSION_STORE);
  const session = (await requestResult(
    sessions.get(chunk.sessionId),
  )) as LocalPracticeSession | undefined;
  if (!session || session.userId !== userId || session.status !== 'building') {
    transaction.abort();
    throw new Error('The local practice session is unavailable.');
  }
  if (
    session.storedCount !== chunk.startPosition ||
    chunk.startPosition + chunk.itemCount > session.totalCount
  ) {
    transaction.abort();
    throw new Error('The local practice queue arrived out of order.');
  }

  transaction.objectStore(QUEUE_STORE).put(chunk);
  sessions.put({
    ...session,
    storedCount: session.storedCount + chunk.itemCount,
    updatedAt: new Date().toISOString(),
  } satisfies LocalPracticeSession);
  await transactionDone(transaction);
}

export async function completeLocalPracticeSession(
  sessionId: string,
  userId: string,
) {
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, 'readwrite');
  const store = transaction.objectStore(SESSION_STORE);
  const session = (await requestResult(
    store.get(sessionId),
  )) as LocalPracticeSession | undefined;
  if (
    !session ||
    session.userId !== userId ||
    session.status !== 'building' ||
    session.storedCount !== session.totalCount
  ) {
    transaction.abort();
    throw new Error('The local practice queue did not finish saving correctly.');
  }
  store.put({
    ...session,
    status: 'generated',
    updatedAt: new Date().toISOString(),
  } satisfies LocalPracticeSession);
  await transactionDone(transaction);
}

export async function getLocalPracticeSession(
  sessionId: string,
  userId: string,
) {
  if (!UUID.test(sessionId) || !UUID.test(userId)) return null;
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, 'readonly');
  const session = (await requestResult(
    transaction.objectStore(SESSION_STORE).get(sessionId),
  )) as LocalPracticeSession | undefined;
  await transactionDone(transaction);
  if (!session || session.userId !== userId || session.status === 'building')
    return null;
  return session;
}

async function findVariantPosition(
  database: IDBDatabase,
  sessionId: string,
  variantId: string,
) {
  const transaction = database.transaction(QUEUE_STORE, 'readonly');
  const chunks = (await requestResult(
    transaction.objectStore(QUEUE_STORE).index('sessionId').getAll(sessionId),
  )) as LocalPracticeQueueChunk[];
  await transactionDone(transaction);
  for (const chunk of chunks.sort((a, b) => a.startPosition - b.startPosition)) {
    const index = chunk.items.findIndex((item) => item[1] === variantId);
    if (index >= 0) return chunk.startPosition + index;
  }
  return null;
}

export async function getLocalPracticeSessionPage({
  sessionId,
  userId,
  page,
  pageSize = 50,
  requestedVariantId,
}: {
  sessionId: string;
  userId: string;
  page?: number | null;
  pageSize?: number;
  requestedVariantId?: string | null;
}) {
  const session = await getLocalPracticeSession(sessionId, userId);
  if (!session) return null;
  const database = await openDatabase();
  const safePageSize = Math.min(Math.max(Math.trunc(pageSize || 50), 10), 100);
  const pages = Math.max(1, Math.ceil(session.totalCount / safePageSize));
  const requestedPosition =
    requestedVariantId && UUID.test(requestedVariantId)
      ? await findVariantPosition(database, sessionId, requestedVariantId)
      : null;
  const currentPage = Math.min(
    pages,
    Math.max(
      1,
      requestedPosition !== null
        ? Math.floor(requestedPosition / safePageSize) + 1
        : Number.isInteger(page) && Number(page) > 0
          ? Number(page)
          : Math.floor(session.currentPosition / safePageSize) + 1,
    ),
  );
  const offset = (currentPage - 1) * safePageSize;
  const lastPosition = Math.min(
    session.totalCount - 1,
    offset + safePageSize - 1,
  );
  const firstChunkStart =
    Math.floor(offset / session.chunkSize) * session.chunkSize;
  const transaction = database.transaction(
    [SESSION_STORE, QUEUE_STORE],
    'readwrite',
  );
  const queueStore = transaction.objectStore(QUEUE_STORE);
  const items: LocalPracticePageItem[] = [];
  for (
    let chunkStart = firstChunkStart;
    chunkStart <= lastPosition;
    chunkStart += session.chunkSize
  ) {
    const chunk = (await requestResult(
      queueStore.get([sessionId, chunkStart]),
    )) as LocalPracticeQueueChunk | undefined;
    if (!chunk) {
      transaction.abort();
      throw new Error('Part of this local practice queue is missing.');
    }
    for (let index = 0; index < chunk.items.length; index += 1) {
      const position = chunk.startPosition + index;
      if (position < offset || position > lastPosition) continue;
      const tuple = chunk.items[index];
      if (!validTuple(tuple)) {
        transaction.abort();
        throw new Error('This local practice queue is damaged.');
      }
      items.push({
        position,
        questionId: tuple[0],
        variantId: tuple[1],
        primaryBlockKey: tuple[2],
        matchedBlockKeys: [...tuple[3]],
      });
    }
  }

  const now = new Date().toISOString();
  transaction.objectStore(SESSION_STORE).put({
    ...session,
    lastOpenedAt: now,
    updatedAt: now,
  } satisfies LocalPracticeSession);
  await transactionDone(transaction);

  return {
    session: { ...session, lastOpenedAt: now, updatedAt: now },
    items,
    currentPage,
    pages,
    pageSize: safePageSize,
    offset,
  };
}

export async function updateLocalPracticeSessionPosition({
  sessionId,
  userId,
  position,
}: {
  sessionId: string;
  userId: string;
  position: number;
}) {
  if (!Number.isInteger(position) || position < 0) return false;
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, 'readwrite');
  const store = transaction.objectStore(SESSION_STORE);
  const session = (await requestResult(
    store.get(sessionId),
  )) as LocalPracticeSession | undefined;
  if (!session || session.userId !== userId || position >= session.totalCount) {
    transaction.abort();
    return false;
  }
  const now = new Date().toISOString();
  store.put({
    ...session,
    currentPosition: position,
    status:
      position >= session.totalCount - 1 ? 'completed' : 'in_progress',
    updatedAt: now,
    lastOpenedAt: now,
  } satisfies LocalPracticeSession);
  await transactionDone(transaction);
  return true;
}

export async function readLocalPracticeQueueChunks(
  sessionId: string,
  userId: string,
) {
  const session = await getLocalPracticeSession(sessionId, userId);
  if (!session) throw new Error('This local practice session is unavailable.');
  const database = await openDatabase();
  const transaction = database.transaction(QUEUE_STORE, 'readonly');
  const chunks = (await requestResult(
    transaction.objectStore(QUEUE_STORE).index('sessionId').getAll(sessionId),
  )) as LocalPracticeQueueChunk[];
  await transactionDone(transaction);
  const ordered = chunks.sort((a, b) => a.startPosition - b.startPosition);
  const storedCount = ordered.reduce((total, chunk) => total + chunk.itemCount, 0);
  if (storedCount !== session.totalCount)
    throw new Error('This local practice queue is incomplete.');
  return { session, chunks: ordered };
}

export async function cleanupLocalPracticeSessions(
  userId: string,
  preserveSessionId?: string | null,
) {
  if (!UUID.test(userId)) return 0;
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, 'readonly');
  const sessions = (await requestResult(
    transaction.objectStore(SESSION_STORE).index('userId').getAll(userId),
  )) as LocalPracticeSession[];
  await transactionDone(transaction);

  const now = Date.now();
  const newestFirst = sessions.sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
  const remove = new Set<string>();
  for (const [index, session] of newestFirst.entries()) {
    if (session.id === preserveSessionId) continue;
    const updatedAt = Date.parse(session.updatedAt);
    if (
      !Number.isFinite(updatedAt) ||
      now - updatedAt > sessionExpiry(session) ||
      index >= MAX_SESSIONS_PER_USER
    )
      remove.add(session.id);
  }
  for (const sessionId of remove)
    await discardLocalPracticeSession(sessionId, userId).catch(() => false);
  return remove.size;
}

export async function ensureLocalPracticeStorage(
  userId: string,
  expectedQuestionCount: number,
) {
  await cleanupLocalPracticeSessions(userId);
  if (typeof navigator === 'undefined') return;
  await navigator.storage?.persist?.().catch(() => false);
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  if (!estimate?.quota || estimate.usage === undefined) return;
  const available = estimate.quota - estimate.usage;
  const estimatedRequired = Math.max(
    1_500_000,
    Math.max(1, expectedQuestionCount) * 300,
  );
  if (available < estimatedRequired)
    throw new Error(
      'This device does not have enough browser storage for that practice queue. Clear old site data or generate a smaller set.',
    );
}
