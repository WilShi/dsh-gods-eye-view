window.__ModuleLoader__.load({
  id: '@local/gods-eye-panel',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useState } = React;
    const NS = 'godsEyePanel';
    const PANEL_ID = 'gods-eye';
    const STATUS_URL = '/gods-eye-panel/api/status';
    const PENDING_URL = '/gods-eye-panel/api/pending-view';
    const MODE_KEY = 'gods-eye-panel.upstream-mode';
    let latestView = null;
    let lastViewId = null;

    const DICTS = {
      en: {
        nav: 'Gods Eye', title: 'God’s Eye View',
        chinaMode: 'China', globalMode: 'International',
        loading: 'Loading the full God’s Eye View…', error: 'God’s Eye View could not start',
        retry: 'Check again', external: 'Open in system browser', focus: 'Focus mode', reload: 'Reload',
        applied: 'View applied', applyFailed: 'View could not be applied',
        ready: 'The full upstream console is embedded here. Map sources and optional providers are available inside the app.',
      },
      zh: {
        nav: '上帝视角', title: 'God’s Eye View',
        chinaMode: '国内', globalMode: '国际',
        loading: '正在加载完整 God’s Eye View…', error: 'God’s Eye View 启动失败',
        retry: '重新检查', external: '在系统浏览器中打开', focus: '专注模式', reload: '重新加载',
        applied: '视图已应用', applyFailed: '视图应用失败',
        ready: '这里内嵌完整上游控制台，地图源和可选服务可在应用内设置。',
      },
    };

    const CSS = `
      .gep-embed{position:relative;height:100%;width:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base)}
      .gep-embed *{box-sizing:border-box}
      .gep-frame{display:block;width:100%;height:100%;border:0;background:var(--dsw-alias-bg-base)}
      .gep-frame[data-loading="true"]{visibility:hidden}
      .gep-overlay{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}
      .gep-overlay[data-error="true"]{color:var(--dsw-alias-state-error-primary)}
      .gep-error-detail{max-width:680px;font-size:12px;line-height:1.6;overflow-wrap:anywhere}
      .gep-spinner{width:28px;height:28px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:gep-turn 1s linear infinite}
      @keyframes gep-turn{to{transform:rotate(360deg)}}
      .gep-tools{position:absolute;z-index:2;right:12px;top:12px;display:flex;align-items:center;gap:4px;padding:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-overlay);opacity:.45;transition:opacity .15s ease}
      .gep-tools:hover,.gep-tools:focus-within{opacity:1}
      .gep-tools button{border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);padding:5px 9px;font:11px/1.2 inherit;cursor:pointer}
      .gep-tools button:hover{background:var(--dsw-alias-bg-layer-2)}
      .gep-tools button[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}
      .gep-tools button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .gep-tools .gep-external{margin-left:2px;border-left:1px solid var(--dsw-alias-border-l1);border-radius:0 5px 5px 0;font-size:15px;padding:3px 8px}
      .gep-check{border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:7px 12px;font:inherit;cursor:pointer}
      .gep-applied{position:absolute;z-index:2;right:12px;bottom:12px;max-width:320px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-state-success-primary);font-size:11px}
      .gep-applied[data-error="true"]{color:var(--dsw-alias-state-error-primary)}
      @media(prefers-reduced-motion:reduce){.gep-spinner{animation:none}.gep-tools{transition:none}}
    `;

    function GlobeIcon({ size = 20, active = false }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
        style: { color: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor', flex: 'none' },
      },
        h('circle', { cx: 12, cy: 12, r: 8.5, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('ellipse', { cx: 12, cy: 12, rx: 4, ry: 8.5, stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', { d: 'M3.5 12h17M5.2 7.2h13.6M5.2 16.8h13.6', stroke: 'currentColor', strokeWidth: 1.1 }),
        h('circle', { cx: 18.5, cy: 5.5, r: 2, fill: 'var(--dsw-alias-brand-primary)' }),
      );
    }

    function initialMode() {
      try { return window.localStorage.getItem(MODE_KEY) === 'china' ? 'china' : 'global'; } catch { return 'global'; }
    }
    function upstreamUrl(base, mode, external = false) {
      const url = new URL(base);
      if (!external) url.searchParams.set('embed', 'full');
      url.hash = `map=${mode === 'china' ? 'osm' : 'esri-imagery'}`;
      return url.href;
    }

    function EmbeddedConsole({ t, ctx }) {
      const iframeRef = React.useRef(null);
      const upstreamReadyRef = React.useRef(false);
      const pendingViewRef = React.useRef(null);
      const [applied, setApplied] = useState(null);
      const [mode, setMode] = useState(initialMode);
      const [state, setState] = useState({ status: 'starting', message: t('loading') });
      const [loaded, setLoaded] = useState(false);
      const [revision, setRevision] = useState(0);

      useEffect(() => {
        let active = true;
        const poll = async () => {
          try {
            const response = await window.fetch(STATUS_URL, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
            const next = await response.json();
            if (active) setState(next);
          } catch (error) {
            if (active) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
          }
        };
        poll();
        const timer = window.setInterval(poll, 2000);
        return () => { active = false; window.clearInterval(timer); };
      }, []);

      const flushView = () => {
        if (!upstreamReadyRef.current || !pendingViewRef.current || !iframeRef.current?.contentWindow || !state.url) return;
        const pending = pendingViewRef.current;
        pendingViewRef.current = null;
        iframeRef.current.contentWindow.postMessage({ type: 'gev:view', id: pending.id, view: pending.view }, new URL(state.url).origin);
      };
      useEffect(() => {
        if (latestView) pendingViewRef.current = latestView;
        const onDshView = (event) => { pendingViewRef.current = event.detail; flushView(); };
        const onMessage = (event) => {
          if (state.url && event.origin !== new URL(state.url).origin) return;
          const data = event.data;
          if (data?.type === 'gev:ready') {
            upstreamReadyRef.current = true;
            flushView();
          } else if (data?.type === 'gev:view-applied') {
            setApplied(data.ok ? { ok: true } : { ok: false, error: data.error || data.steps });
          }
        };
        window.addEventListener('gep:dsh-view', onDshView);
        window.addEventListener('message', onMessage);
        return () => {
          window.removeEventListener('gep:dsh-view', onDshView);
          window.removeEventListener('message', onMessage);
        };
      }, [state.url, revision]);
      useEffect(() => {
        if (!applied) return;
        const timer = window.setTimeout(() => setApplied(null), 5000);
        return () => window.clearTimeout(timer);
      }, [applied]);

      const changeMode = (next) => {
        if (next === mode) return;
        setMode(next);
        setLoaded(false);
        upstreamReadyRef.current = false;
        pendingViewRef.current = null;
        setRevision((value) => value + 1);
        try { window.localStorage.setItem(MODE_KEY, next); } catch { /* Optional preference. */ }
      };

      const ready = state.status === 'ready' && Boolean(state.url);
      const source = ready ? upstreamUrl(state.url, mode) : 'about:blank';
      return h('div', { className: 'gep-embed' },
        h('style', null, CSS),
        ready && h('iframe', {
          ref: iframeRef,
          key: `${mode}:${revision}`,
          className: 'gep-frame',
          'data-loading': !loaded,
          src: source,
          title: t('title'),
          onLoad: () => setLoaded(true),
          allow: 'microphone; camera; geolocation; clipboard-read; clipboard-write; fullscreen; downloads',
          allowFullScreen: true,
          referrerPolicy: 'no-referrer',
        }),
        ready && h('div', { className: 'gep-tools', role: 'group', 'aria-label': t('title') },
          h('button', { type: 'button', 'aria-pressed': mode === 'china', onClick: () => changeMode('china') }, t('chinaMode')),
          h('button', { type: 'button', 'aria-pressed': mode === 'global', onClick: () => changeMode('global') }, t('globalMode')),
          h('button', { type: 'button', title: t('focus'), onClick: () => ctx.layout.toggleSidebar() }, t('focus')),
          h('button', { type: 'button', title: t('reload'), onClick: () => { setLoaded(false); upstreamReadyRef.current = false; pendingViewRef.current = null; setRevision((value) => value + 1); } }, t('reload')),
          h('button', { type: 'button', className: 'gep-external', title: t('external'), 'aria-label': t('external'), onClick: () => window.open(upstreamUrl(state.url, mode, true), '_blank', 'noopener') }, '↗'),
        ),
        (!ready || !loaded) && h('div', { className: 'gep-overlay', 'data-error': state.status === 'error', role: 'status' },
          state.status === 'error'
            ? h(React.Fragment, null,
                h('strong', null, t('error')),
                h('div', { className: 'gep-error-detail' }, state.message),
                h('button', { type: 'button', className: 'gep-check', onClick: () => { setState({ status: 'starting', message: t('loading') }); setLoaded(false); setRevision((value) => value + 1); } }, t('retry')),
              )
            : h(React.Fragment, null, h('span', { className: 'gep-spinner', 'aria-hidden': true }), h('span', null, state.message || t('loading'))),
        ),
        applied && h('div', { className: 'gep-applied', 'data-error': !applied.ok, role: 'status' }, applied.ok ? t('applied') : `${t('applyFailed')}: ${applied.error || ''}`),
      );
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'gods-eye-panel: dictionaries');
        const t = ctx.locale.bind(NS);
        const component = () => h(EmbeddedConsole, { t, ctx });
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, component));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: PANEL_ID, order: 20, locale: NS, label: () => t('nav'),
        }, GlobeIcon));
        ctx.effect(() => {
          let active = true;
          const poll = async () => {
            try {
              const response = await window.fetch(PENDING_URL, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
              const pending = await response.json();
              if (!active || !pending?.id || pending.id === lastViewId) return;
              lastViewId = pending.id;
              latestView = pending;
              ctx.layout.selectPanel(PANEL_ID);
              window.dispatchEvent(new CustomEvent('gep:dsh-view', { detail: pending }));
            } catch { /* Status polling already reports upstream failures. */ }
          };
          poll();
          const timer = window.setInterval(poll, 2000);
          return () => { active = false; window.clearInterval(timer); };
        }, 'gods-eye-panel: DSH view bridge');
      },
    };
  },
});
