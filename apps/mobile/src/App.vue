<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { ErrorCode } from "@walk-together/shared-types";
import { getMe } from "./api/auth";
import { clearSession, isLoggedIn, setProfile } from "./store/session";

onLaunch(() => {
  if (!isLoggedIn()) {
    return;
  }
  void getMe().then((result) => {
    if (result.code === ErrorCode.OK && result.data) {
      setProfile(result.data);
      return;
    }
    if (result.code === ErrorCode.UNAUTHORIZED) {
      clearSession();
    }
  });
});
</script>

<style>
:root,
page {
  --wot-color-theme: #1d4f91;
  background-color: #f4f6f8;
  color: #1f2937;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
</style>
