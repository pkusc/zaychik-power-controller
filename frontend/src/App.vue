<script setup lang="ts">

import { RouterLink, RouterView } from 'vue-router'

</script>

<template>
  <v-layout>
    <v-main>
      <Suspense>
        <RouterView />
      </Suspense>
    </v-main>
  </v-layout>
</template>
