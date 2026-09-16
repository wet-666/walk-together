export type AmapJsApi = {
  Map: new (
    container: string | HTMLElement,
    options: { zoom?: number; center?: [number, number]; viewMode?: string },
  ) => AmapMap;
  Marker: new (options: {
    position: [number, number];
    title?: string;
    label?: { content: string; direction: string };
  }) => { setMap: (map: AmapMap | null) => void; setPosition: (position: [number, number]) => void };
  Polyline: new (options: {
    path: Array<[number, number]>;
    strokeColor?: string;
    strokeWeight?: number;
    strokeStyle?: string;
  }) => { setMap: (map: AmapMap | null) => void; setPath: (path: Array<[number, number]>) => void };
};

type AmapMap = {
  setFitView: (overlays?: unknown[], immediately?: boolean, avoid?: number[]) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    AMap?: AmapJsApi;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

let loading: Promise<AmapJsApi | null> | null = null;

export function getAmapJsKey(): string {
  return import.meta.env.VITE_AMAP_JS_KEY?.trim() || "";
}

export function loadAmapJs(): Promise<AmapJsApi | null> {
  const key = getAmapJsKey();
  if (!key) {
    return Promise.resolve(null);
  }
  if (window.AMap) {
    return Promise.resolve(window.AMap);
  }
  if (loading) {
    return loading;
  }
  loading = new Promise((resolve) => {
    const security = import.meta.env.VITE_AMAP_JS_SECURITY?.trim();
    if (security) {
      window._AMapSecurityConfig = { securityJsCode: security };
    }
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => resolve(window.AMap ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loading;
}
