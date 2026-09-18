export type DeviceLocation = {
  lng: number;
  lat: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
};

export type LocateStatus = "gps" | "denied" | "unavailable" | "timeout";

export function getDeviceLocation(): Promise<DeviceLocation | null> {
  return locateDevice().then((result) => result.location);
}

export function locateDevice(): Promise<{ location: DeviceLocation | null; status: LocateStatus }> {
  return locateByUni().then((result) => {
    if (result.location) {
      return result;
    }
    return locateByBrowser();
  });
}

function locateByUni(): Promise<{ location: DeviceLocation | null; status: LocateStatus }> {
  return new Promise((resolve) => {
    uni.getLocation({
      type: "gcj02",
      isHighAccuracy: false,
      success: (res) => {
        resolve({
          location: {
            lng: res.longitude,
            lat: res.latitude,
            speed: finiteOrNull(res.speed),
            heading: finiteOrNull(res.heading),
            accuracy: finiteOrNull(res.accuracy),
          },
          status: "gps",
        });
      },
      fail: (err) => {
        resolve({ location: null, status: locateFailStatus(err?.errMsg) });
      },
    });
  });
}

function locateByBrowser(): Promise<{ location: DeviceLocation | null; status: LocateStatus }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ location: null, status: "unavailable" });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          location: {
            lng: Number(pos.coords.longitude.toFixed(6)),
            lat: Number(pos.coords.latitude.toFixed(6)),
            speed: finiteOrNull(pos.coords.speed ?? undefined),
            heading: finiteOrNull(pos.coords.heading ?? undefined),
            accuracy: finiteOrNull(pos.coords.accuracy),
          },
          status: "gps",
        });
      },
      (err) => {
        if (err.code === 1) {
          resolve({ location: null, status: "denied" });
          return;
        }
        if (err.code === 3) {
          resolve({ location: null, status: "timeout" });
          return;
        }
        resolve({ location: null, status: "unavailable" });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  });
}

function locateFailStatus(message?: string): LocateStatus {
  const text = message || "";
  if (/auth|deny|permission|拒绝/i.test(text)) {
    return "denied";
  }
  if (/timeout|超时/i.test(text)) {
    return "timeout";
  }
  return "unavailable";
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Number(value.toFixed(1)) : null;
}
