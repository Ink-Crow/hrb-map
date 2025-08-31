<template>
    <el-input v-model="input" placeholder="Please input" />
    <el-switch v-model="value1" />
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { ElInput, ElSwitch } from 'element-plus'
const input = ref('')
const value1 = ref(false)
</script>
