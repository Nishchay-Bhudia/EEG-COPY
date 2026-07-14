// Toast — reusable notification primitive. Ported from the legacy app.js's
// showToast()/#toast element. A single module-scoped ref means every caller
// shares the same toast slot/timer, matching the legacy singleton behavior.
import { ref } from 'vue';

const message = ref('');
const visible = ref(false);
let timer = null;

export function useToast() {
  function showToast(msg) {
    message.value = msg;
    visible.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => { visible.value = false; }, 2600);
  }
  return { message, visible, showToast };
}
