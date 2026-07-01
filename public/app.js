const userSelect = document.querySelector('#demo-user');
const statusBox = document.querySelector('#status');
const libraryBox = document.querySelector('#library');
const profileBox = document.querySelector('#profile');
const adminBox = document.querySelector('#admin');

function setDemoUser(email) {
  document.cookie = `demo_user=${encodeURIComponent(email)}; path=/; SameSite=Lax`;
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw body;
  return body;
}

function resourceCard(resource) {
  return `<article class="resource">
    <p class="eyebrow">${resource.type}</p>
    <h2>${resource.name}</h2>
    <p>${resource.description}</p>
    <div class="actions">
      <button data-action="open" data-id="${resource.id}">Open</button>
      <button data-action="preview" data-id="${resource.id}">Preview</button>
      <button data-action="download" data-id="${resource.id}">Download</button>
    </div>
  </article>`;
}

async function load() {
  const { user, configured } = await api('/api/session');
  userSelect.value = user.email;
  statusBox.className = `card ${user.approved ? 'success' : 'warning'}`;
  statusBox.innerHTML = user.approved
    ? `<h2>Welcome, ${user.name}</h2><p>${configured ? 'Google Drive is configured.' : 'Google Drive is not configured yet. Add environment variables to enable live resources.'}</p>`
    : '<h2>Awaiting approval</h2><p>Your account is unapproved by default. An admin must approve access before resources are visible.</p>';

  libraryBox.innerHTML = '';
  profileBox.innerHTML = '';
  adminBox.innerHTML = '';

  if (!user.approved) return;

  const library = await api('/api/library');
  libraryBox.innerHTML = library.resources.length
    ? library.resources.map(resourceCard).join('')
    : '<article class="resource warning"><h2>No Google Drive folder configured</h2><p>Set GOOGLE_DRIVE_FOLDER_ID, GOOGLE_CLIENT_EMAIL, and GOOGLE_PRIVATE_KEY to connect the library.</p></article>';

  const profile = await api('/api/profile');
  profileBox.innerHTML = `<h2>Your activity</h2><p class="muted">Normal users only see their own profile and activity.</p><pre>${JSON.stringify(profile.activity, null, 2)}</pre>`;

  if (user.admin) {
    const [users, logs] = await Promise.all([api('/api/admin/users'), api('/api/admin/activity')]);
    adminBox.innerHTML = `<h2>Admin</h2><p>Admins can approve users, revoke users, view all activity logs, and export activity data.</p>
      <h3>Users</h3><pre>${JSON.stringify(users.users, null, 2)}</pre>
      <h3>All activity</h3><pre>${JSON.stringify(logs.activity, null, 2)}</pre>`;
  }
}

userSelect.addEventListener('change', () => {
  setDemoUser(userSelect.value);
  load();
});

libraryBox.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const result = await api(`/api/resources/${button.dataset.id}/${button.dataset.action}`, { method: 'POST' });
  alert(result.message);
  load();
});

setDemoUser(userSelect.value);
load();
