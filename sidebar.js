/* Sidebar — shared across all pages */
(function () {
  function getCurrentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }
  function activeClass(page) {
    return getCurrentPage() === page ? ' active' : '';
  }
  function injectSidebar() {
    const user = (typeof getUser === 'function') ? getUser() : null;
    const name = user ? user.jina : 'Mteja';
    const phone = user ? (user.simu || '') : '';

    document.body.insertAdjacentHTML('afterbegin', `
      <div class="sidebar-overlay" id="sb-overlay"></div>
      <div class="sidebar-drawer" id="sb-drawer">
        <div class="sidebar-head">
          <div class="sb-avatar">
            <i class="icon-user-fill" style="font-size:26px;color:rgba(255,255,255,0.85);"></i>
          </div>
          <div class="sb-info">
            <h4 id="sb-name">${name}</h4>
            <p id="sb-phone">${phone}</p>
          </div>
          <button class="sb-close" id="sb-close"  style="color:transparent;background: none">
            <i class="icon-close1" style="font-size:14px; color: white; border-left: 10px"></i>
          </button>
        </div>
        <div class="sidebar-body">
          <div class="sb-nav-group">
            <div class="sb-nav-label">Menyu Kuu</div>
            <a href="index.html" class="sb-nav-link${activeClass('index.html')}">
              <i class="icon-home"></i><span>Nyumbani</span>
            </a>
            <a href="maombi.html" class="sb-nav-link${activeClass('maombi.html')}">
              <i class="icon-request"></i><span>Maombi Yangu</span>
            </a>
            <a href="arifa.html" class="sb-nav-link${activeClass('arifa.html')}">
              <i class="icon-noti"></i><span>Arifa</span>
            </a>
          </div>
          <hr class="sb-nav-divider">
          <div class="sb-nav-group">
            <div class="sb-nav-label">Huduma</div>
            <a href="lipa-namba.html" class="sb-nav-link${activeClass('lipa-namba.html')}">
              <i class="icon-mobile"></i><span>Omba Lipa Namba</span>
            </a>
            <a href="till-uwakala.html" class="sb-nav-link${activeClass('till-uwakala.html')}">
              <i class="icon-bankgroup"></i><span>Omba Till ya Uwakala</span>
            </a>
          </div>
          <hr class="sb-nav-divider">
          <div class="sb-nav-group">
            <div class="sb-nav-label">Akaunti</div>
            <a href="profile.html" class="sb-nav-link${activeClass('profile.html')}">
              <i class="icon-user-outline"></i><span>Wasifu Wangu</span>
            </a>
            <a href="msaada.html" class="sb-nav-link${activeClass('msaada.html')}">
              <i class="icon-info"></i><span>Msaada</span>
            </a>
          </div>
        </div>
        <div class="sidebar-foot">
          <button class="sb-logout" id="sb-logout">
            <i class="icon-log-in1"></i><span>Toka (Logout)</span>
          </button>
        </div>
      </div>
    `);

    const overlay = document.getElementById('sb-overlay');
    const drawer = document.getElementById('sb-drawer');
    const closeBtn = document.getElementById('sb-close');
    const logoutBtn = document.getElementById('sb-logout');

    function openSidebar() { overlay.classList.add('open'); drawer.classList.add('open'); }
    function closeSidebar() { overlay.classList.remove('open'); drawer.classList.remove('open'); }

    overlay.addEventListener('click', closeSidebar);
    closeBtn.addEventListener('click', closeSidebar);
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (typeof logout === 'function') logout();
        else { localStorage.removeItem('wakala_user'); localStorage.removeItem('wp_user'); window.location.href = 'login.html'; }
        closeSidebar();
      });
    }
    window.openSidebar = openSidebar;
    window.closeSidebar = closeSidebar;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSidebar);
  } else {
    injectSidebar();
  }
})();
