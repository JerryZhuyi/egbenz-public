<template>
    <el-progress 
    v-show="show"
    :show-text="false"
    :percentage="progressValue" class="global-progress" striped striped-flow :duration="50"
    :stroke-width="8"
    ></el-progress>
</template>
  
<script lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { events } from '../bus';

export default {
    setup() {
        let pollingClock: any;
        let keepPolling = false;
        // 避免频繁请求,设置一个是否正在请求progress的标志,下一次请求需要等待上一次请求完成
        let isRequesting = false;

        const progressValue = ref(0);
        const show = ref(false);
        // 开始远程轮询
        const _innerStartServerPolling = async (params: any) => {
            const { callback, interval } = params
            clearTimeout(pollingClock)
            if (!keepPolling || isRequesting) {
                return;
            }
            pollingClock = setTimeout(() => {
                isRequesting = true;
                (callback as ()=>Promise<any>)().then((res: any) => {
                    isRequesting = false;
                    const progressValue = res.progress;
                    if(progressValue) updateProgress(progressValue)

                    if (keepPolling) {
                        _innerStartServerPolling(params)
                    }
                }).catch((err: any) => {
                    isRequesting = false;
                    console.error("失败", err)
                })
            }, interval)
        }
        const startServerPolling = async (params: any) => {
            keepPolling = true;
            _innerStartServerPolling(params)
        }

        const stopServerPolling = ()=>{
            clearTimeout(pollingClock)
            keepPolling = false;
        }

        const showProgress = () => {
            show.value = true;
        };
        const hideProgress = () => {
            show.value = false;
        };
        const updateProgress = (value:any) => {
            progressValue.value = value;
        };

        onMounted(() => {
            events.on('show-progress', showProgress);
            events.on('hide-progress', hideProgress);
            events.on('update-progress', updateProgress);
            events.on('start-server-polling', startServerPolling);
            events.on('stop-server-polling', stopServerPolling);
        });

        onUnmounted(() => {
            events.off('show-progress', showProgress);
            events.off('hide-progress', hideProgress);
            events.off('update-progress', updateProgress);
            events.off('start-server-polling', startServerPolling);
            events.off('stop-server-polling', stopServerPolling);
        });


        return {
            progressValue,
            show,
        };
    }
};
</script>
  
<style scoped>
.global-progress {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 9999;
}
</style>