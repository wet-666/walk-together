<template>
  <view class="feedback">
    <text class="feedback__lead">内测阶段先把问题和建议留给我们，不接第三方客服。</text>
    <wd-textarea
      v-model="content"
      placeholder="请描述你遇到的问题，或想改进的地方"
      :maxlength="500"
      show-word-limit
      :rows="6"
    />
    <wd-input v-model="contact" placeholder="联系方式（选填）" :maxlength="64" clearable />
    <wd-button type="primary" block :loading="submitting" @click="onSubmit">提交</wd-button>
  </view>
</template>

<script setup lang="ts">
import { ErrorCode } from "@walk-together/shared-types";
import { ref } from "vue";
import { submitFeedback } from "../../api/auth";

const content = ref("");
const contact = ref("");
const submitting = ref(false);

async function onSubmit() {
  const text = content.value.trim();
  if (!text) {
    uni.showToast({ title: "请填写意见内容", icon: "none" });
    return;
  }
  if (submitting.value) {
    return;
  }
  submitting.value = true;
  const result = await submitFeedback({
    content: text,
    contact: contact.value.trim() || undefined,
  });
  submitting.value = false;
  if (result.code === ErrorCode.OK) {
    uni.showToast({ title: "已提交，感谢反馈", icon: "none" });
    setTimeout(() => uni.navigateBack(), 400);
  }
}
</script>

<style scoped>
.feedback {
  padding: 32rpx 40rpx 80rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.feedback__lead {
  font-size: 26rpx;
  line-height: 1.6;
  color: #6b7280;
}
</style>
