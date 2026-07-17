import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(p, 'utf8');

describe('library interaction redesign', () => {
  const browser = () => read('app/library/library-browser.tsx');
  it('normal row click opens folder/file and does not select details', () => {
    const s = browser();
    expect(s).toContain('onClick={()=>openItem(item,rootId,path)}');
    expect(s).not.toContain('onClick={()=>setSelected(item)}');
    expect(s).not.toContain('setSelected');
  });
  it('context menu opens via right-click and closes on Escape/outside click', () => {
    const s = browser();
    expect(s).toContain(
      'onContextMenu={e=>{e.preventDefault();onMenu(item,e.clientX,e.clientY)}}',
    );
    expect(s).toContain("e.key==='Escape'");
    expect(s).toContain("document.addEventListener('mousedown',h)");
  });
  it('three-dot menu opens the context menu without row navigation', () => {
    const s = browser();
    expect(s).toContain('More actions for');
    expect(s).toContain('e.stopPropagation()');
    expect(s).toContain('onMenu(item,r.left,r.bottom+4)');
  });
  it('details only opens from the Details action', () => {
    const s = browser();
    expect(s).toContain('Details</button>');
    expect(s).toContain('onDetails={()=>setDetails(menu.item)}');
    expect(s).not.toContain('onClick={()=>setDetails');
  });
  it('has only global search and no library hero gradient', () => {
    const s = browser();
    expect(s).not.toContain('bg-gradient-to-r');
    expect(s).not.toContain('Use global search');
  });
  it('sidebar navigation exists', () => {
    expect(read('components/app-sidebar.tsx')).toContain(
      'data-testid="app-sidebar"',
    );
    expect(read('components/nav.tsx')).toContain('AppTopbar');
  });
});
