<script setup lang="ts">
import { ArrowRight } from '@element-plus/icons-vue';
import { computed } from 'vue';

const props = defineProps({
  openedNodePath: {
    // readonly
    type: String, // Provide the correct type for the paths prop
    default: () => ['所有笔记'],
  },
})

const paths = computed(() => {
  const paths = props.openedNodePath.split('/')
  return paths
})

</script>

<template>
  <el-breadcrumb :separator-icon="ArrowRight">
    <el-breadcrumb-item v-for="(name, _) in paths">{{ name }}</el-breadcrumb-item>
  </el-breadcrumb>
</template>

<style scoped></style>
