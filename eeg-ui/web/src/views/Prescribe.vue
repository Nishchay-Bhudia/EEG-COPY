<script setup>
// Prescribe view — placeholder for P4 (not yet built).
// The legacy Prescribe is still a stub, so this renders a centered
// "coming soon" card using the shared design tokens.
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();
</script>

<template>
  <div class="prescribe-view">
    <div class="card prescribe-card">
      <h1 class="prescribe-title">{{ t('prescribeTitle') }}</h1>
      <p class="prescribe-desc">{{ t('prescribeHint') }}</p>
      <span class="prescribe-tag">{{ t('prescribeTag') }} — {{ t('comingSoon') }}</span>
    </div>
  </div>
</template>

<style scoped>
.prescribe-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 24px;
}
.prescribe-card {
  max-width: 440px;
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 36px 32px;
}
.prescribe-title {
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}
.prescribe-desc {
  font-size: 14px;
  color: var(--text-mid);
  line-height: 1.5;
  max-width: 320px;
}
.prescribe-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
  background: var(--accent-dim);
  border-radius: 999px;
  padding: 6px 14px;
}
</style>
