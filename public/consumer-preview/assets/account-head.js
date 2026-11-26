(() => {
  const mode = new URLSearchParams(location.search).get('mode');
  if ((mode !== 'setup' && mode !== 'reset') || !location.hash) return;
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  history.replaceState(history.state, '', location.pathname + location.search);
  Object.defineProperty(window, 'takeStrangersAccountLink', {
    configurable: true,
    value() {
      delete window.takeStrangersAccountLink;
      return token;
    },
  });
})();
