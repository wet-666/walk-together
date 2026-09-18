<script setup lang="ts">
import { onLaunch, onShow } from "@dcloudio/uni-app";
import { ErrorCode } from "@walk-together/shared-types";
import { getMe } from "./api/auth";
import { applyUnreadBadge, refreshUnreadBadge } from "./api/im";
import { startChatInbox } from "./store/chat-inbox";
import { clearSession, isLoggedIn, setProfile } from "./store/session";
// #ifdef APP-PLUS || MP-WEIXIN
import { isLoopbackApiBase } from "./config/env";
// #endif

onLaunch(() => {
  uni.onNetworkStatusChange((res) => {
    if (!res.isConnected) {
      uni.showToast({ title: "网络已断开", icon: "none" });
    }
  });
  // #ifdef APP-PLUS || MP-WEIXIN
  warnLoopbackApi();
  // #endif

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

function warnLoopbackApi() {
  // #ifdef APP-PLUS || MP-WEIXIN
  if (!isLoopbackApiBase()) {
    return;
  }
  uni.showModal({
    title: "真机连不上本机服务",
    content:
      "当前接口指向 127.0.0.1。把 VITE_API_BASE_URL 改成电脑的局域网地址后再编译。",
    showCancel: false,
  });
  // #endif
}
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
