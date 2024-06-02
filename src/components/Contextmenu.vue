<script setup lang="ts">
import { ref } from 'vue'
const contextmenuRef = ref()
const triggerButtonRef = ref()
const popoverVisible = ref(false)

const clickButtonManual = async (e: MouseEvent) => {
  if(popoverVisible.value){
    triggerButtonRef.value.click();
    setTimeout(()=>{
      if (contextmenuRef.value) {
        contextmenuRef.value.style.left = `${e.clientX}px`
        contextmenuRef.value.style.top = `${e.clientY-24}px`
        triggerButtonRef.value.click();
      }
    }, 100)
  }else{
    if (contextmenuRef.value) {
      contextmenuRef.value.style.left = `${e.clientX}px`
      contextmenuRef.value.style.top = `${e.clientY-24}px`
    }
    triggerButtonRef.value.click();
  }
}

defineExpose({clickButtonManual})

const emits = defineEmits(['deletePath', 'renamePath'])

const handleRenamePath = () => {
  emits('renamePath')
}

const handleDeletePath = () => {
  emits('deletePath')
}

</script>

<template>
  <div ref="contextmenuRef" class="contextmenu">
    <el-dropdown @visible-change="(_v:boolean)=>popoverVisible = _v" popper-class="contextmenu-popover" trigger="click">
        <span ref="triggerButtonRef">
          Contextmenu
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="handleRenamePath">重命名</el-dropdown-item>
            <el-dropdown-item @click="handleDeletePath">删除</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
  </div>
</template>

<style scoped>
.contextmenu{
  position: absolute;
  visibility: hidden;
}
</style>
<style>
/* 消除小三角 */
.contextmenu-popover .el-popper__arrow{
  border: none;
  top: 0!important;
}
</style>