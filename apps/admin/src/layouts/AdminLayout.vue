<template>
  <div class="admin-shell">
    <aside class="admin-sidebar" aria-label="后台导航">
      <div class="admin-brand">
        <span class="admin-brand__mark" aria-hidden="true">临</span>
        <div>
          <p class="admin-brand__title">临安文旅</p>
          <p class="admin-brand__subtitle">管理后台</p>
        </div>
      </div>

      <nav class="admin-nav" aria-label="主要菜单">
        <router-link class="admin-nav__item" to="/home">首页</router-link>
        <router-link class="admin-nav__item" to="/configuration">配置</router-link>
        <router-link class="admin-nav__item" to="/roster">名单统计</router-link>
      </nav>
    </aside>

    <section class="admin-main">
      <header class="admin-header">
        <div>
          <p class="admin-header__eyebrow">PC 管理后台</p>
          <h1>研学出行服务台</h1>
        </div>
        <router-link class="admin-header__link" to="/login">登录壳</router-link>
      </header>

      <main class="admin-content">
        <router-view />
      </main>
    </section>
  </div>
</template>
