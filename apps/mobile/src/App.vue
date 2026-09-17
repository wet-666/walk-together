<script setup lang="ts">
import { onLaunch, onShow } from "@dcloudio/uni-app";
import { ErrorCode } from "@walk-together/shared-types";
import { getMe } from "./api/auth";
import { applyUnreadBadge, refreshUnreadBadge } from "./api/im";
import { startChatInbox } from "./store/chat-inbox";
import { clearSession, isLoggedIn, setProfile } from "./store/session";

onLaunch(() => {
  uni.onNetworkStatusChange((res) => {
    if (!res.isConnected) {
      uni.showToast({ title: "网络已断开", icon: "none" });
    }
  });

  if (!isLoggedIn()) {
    applyUnreadBadge(0);
    return;
  }
  startChatInbox();
  void getMe().then((result) => {
    if (result.code === ErrorCode.OK && result.data) {
      setProfile(result.data);
      return;
    }
    if (
      result.code === ErrorCode.UNAUTHORIZED ||
      result.code === ErrorCode.ACCOUNT_DISABLED
    ) {
      clearSession();
    }
  });
});

onShow(() => {
  if (!isLoggedIn()) {
    applyUnreadBadge(0);
    return;
  }
  startChatInbox();
  void refreshUnreadBadge();
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
