import {reactive} from 'vue'

export const globalState = reactive({ 
    screenWidth: window.innerWidth,
    isMobile: window.innerWidth < 768,
    canvasMaxWidth: window.innerWidth < 768 ? window.innerWidth*0.9 : window.innerWidth*0.7,
    canvasFitWidth: window.innerWidth < 768 ? window.innerWidth-40 : window.innerWidth - 280,
    asideWidth: 280,
});

export const resizeScreenWidth = ()=>{
    globalState.screenWidth = window.innerWidth
    globalState.isMobile = window.innerWidth < 768
    globalState.canvasMaxWidth = globalState.isMobile ? window.innerWidth*0.9 : window.innerWidth*0.7
    globalState.canvasFitWidth = window.innerWidth < 768 ? window.innerWidth-40 : window.innerWidth - 320
}

window.addEventListener('resize', resizeScreenWidth)
