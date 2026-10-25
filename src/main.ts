import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';
import App from './App.vue';
import router from './router';

/* Ionic: CSS base */
import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';

/* Tipografía incluida en la app (funciona sin conexión) */
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/geist/700.css';

/* Tema de Rumbo */
import './theme/variables.css';
import './theme/app.css';

const app = createApp(App).use(IonicVue, { mode: 'ios' }).use(createPinia()).use(router);

router.isReady().then(() => {
  app.mount('#app');
});
