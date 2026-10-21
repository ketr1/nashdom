window.homeTheme = {
  get() { try { const value=localStorage.getItem('home-theme');return ['light','dark','system'].includes(value)?value:'system'; } catch { return 'system'; } },
  apply(value) {
    const dark=value==='dark'||(value==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.documentElement.style.colorScheme=dark?'dark':'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#14251e':'#244d3d');
  },
  set(value) { try { localStorage.setItem('home-theme',value); }catch{} this.apply(value); }
};
window.homeTheme.apply(window.homeTheme.get());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(window.homeTheme.get()==='system')window.homeTheme.apply('system')});
