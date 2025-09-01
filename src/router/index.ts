import { createRouter, createWebHistory } from 'vue-router'
import indexPage from '../views/index.vue'
import testPage from '../views/save.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: indexPage,
    },{
      path: '/save',
      name: 'testPage',
      component: testPage,
    }
  ],
})

export default router
