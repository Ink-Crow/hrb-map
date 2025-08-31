import { createRouter, createWebHistory } from 'vue-router'
import indexPage from '../views/index.vue'
import testPage from '../views/text.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: indexPage,
    },{
      path: '/test',
      name: 'testPage',
      component: testPage,
    }
  ],
})

export default router
