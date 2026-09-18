export type AmapLngLat = {
  getLng: () => number;
  getLat: () => number;
};

export type AmapOverlay = {
  setMap: (map: AmapMap | null) => void;
  setPath?: (path: Array<[number, number]>) => void;
  setPosition?: (position: [number, number]) => void;
  on?: (event: string, handler: () => void) => void;
};

export type AmapJsApi = {
  Map: new (
    container: string | HTMLElement,
    options: {
      zoom?: number;
      center?: [number, number];
      viewMode?: string;
      dragEnable?: boolean;
      zoomEnable?: boolean;
      doubleClickZoom?: boolean;
      scrollWheel?: boolean;
      showLabel?: boolean;
      mapStyle?: string;
    },
  ) => AmapMap;
  Marker: new (options: {
    position: [number, number];
    title?: string;
    zIndex?: number;
    label?: { content: string; direction: string };
  }) => AmapOverlay & { setPosition: (position: [number, number]) => void };
  Polyline: new (options: {
    path: Array<[number, number]>;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWeight?: number;
    strokeStyle?: string;
    strokeDasharray?: number[];
    lineJoin?: string;
    lineCap?: string;
    zIndex?: number;
    showDir?: boolean;
  }) => AmapOverlay & { setPath: (path: Array<[number, number]>) => void };
  Scale?: new (options?: { position?: string }) => unknown;
  ToolBar?: new (options?: { position?: string }) => unknown;
  plugin?: (name: string | string[], callback: () => void) => void;
  Driving?: new (options?: { hideMarkers?: boolean; autoFitView?: boolean }) => {
    search: (
      origin: [number, number],
      destination: [number, number],
      options: { waypoints?: Array<[number, number]> },
      callback: (status: string, result: AmapDrivingResult) => void,
    ) => void;
  };
};

export type AmapDrivingResult = {
  routes?: Array<{
    steps?: Array<{
      path?: Array<AmapLngLat | [number, number] | { lng: number; lat: number }>;
    }>;
  }>;
};

export type AmapMap = {
  setFitView: (overlays?: unknown[], immediately?: boolean, avoid?: number[]) => void;
  setZoomAndCenter: (zoom: number, center: [number, number], immediately?: boolean) => void;
  addControl: (control: unknown) => void;
  add?: (overlay: AmapOverlay | AmapOverlay[]) => void;
  remove?: (overlay: AmapOverlay | AmapOverlay[]) => void;
  on: (event: string, handler: (e?: { lnglat?: AmapLngLat }) => void) => void;
  resize?: () => void;
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
  if (window.AMap?.Map) {
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
    const callback = `__amapOnLoad${Date.now()}`;
    let settled = false;
    const finish = (api: AmapJsApi | null) => {
      if (settled) {
        return;
      }
      settled = true;
      delete (window as unknown as Record<string, unknown>)[callback];
      resolve(api);
    };
    (window as unknown as Record<string, unknown>)[callback] = () => {
      finish(window.AMap?.Map ? window.AMap : null);
    };
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&callback=${callback}`;
    script.async = true;
    script.onerror = () => finish(null);
    document.head.appendChild(script);
    window.setTimeout(() => {
      finish(window.AMap?.Map ? window.AMap : null);
    }, 12000);
  }).then((api) => {
    if (!api) {
      loading = null;
    }
    return api;
  });
  return loading;
}
