// FileSystem
import { reactive, readonly, computed, ref, toRaw } from 'vue';
import { request } from '../api/index.ts';
import type Node from 'element-plus/es/components/tree/src/model/node'
import { ElTree } from 'element-plus'
import { docStruct, AditorDocView,AditorDocState,version } from 'vue-aditor';
import {version as egbenz_version} from '../../package.json'

export type CustomNode = Node & { data: FilesTreeNode };

const FIXED_ROOT = '所有笔记';

export interface FilesTreeNode {
    label: string;
    path: string;
    isChanged: boolean;
    isLeaf: boolean;
    children?: FilesTreeNode[];
    docJson?: docStruct;
}

export const defaultProps = {
    children: 'children',
    label: 'label',
    path: 'path',
    isLeaf: 'isLeaf',
}

const state = reactive({
    elTreeRef: {} as typeof ElTree,
    activeView: null as AditorDocView | null,
    root: {} as CustomNode,
    openedNodes: [] as CustomNode[],
    openedNode: {} as CustomNode,
    lastContextMenuNode: {} as CustomNode,
});

function _makeFolderData(path:string, file:{name:string, type:string, children?:[]}):FilesTreeNode{
    // fix bug: if the path is a filename, like 'a.ai', the path will be 'a.ai/a.ai', so we need to remove the last filename
    if(path.endsWith('.ai')){
        path = path.replace(/[^/]+$/, '')
    }
    if (file.type == 'folder') {
        return {
            label: file.name,
            path: path + '/' + file.name,
            isChanged: false,
            children: [],
            isLeaf: false
        }
    } else {
        return {
            label: file.name,
            path: path + '/' + file.name,
            isChanged: false,
            isLeaf: true
        }
    }
}

async function _getFiles(path: string):Promise<FilesTreeNode[]> {
    return await request.getFiles({ path }).then((res) => {
        if (!res.data.status) {
            return []
        }else{
            return res.data.files.map((file: { name: string, type: string, children?: [] }) => {
                return _makeFolderData(path, file)
            })
        }
    }).catch((res) => {
        console.warn(res)
        return []
    })
}

async function loadNode(node: Node|CustomNode, resolve: (data: FilesTreeNode[]) => void) {
    if (node.level == 0) {
        state.root = node as CustomNode
        resolve([{ label: FIXED_ROOT, path: FIXED_ROOT, isChanged: false, isLeaf: false }])
    } else if (!node.isLeaf) {
        let childNodes: FilesTreeNode[] = await _getFiles(node.data.path)
        resolve(childNodes)
    }
}

async function _updateKeyChildren(key: string, data: FilesTreeNode[]) {
    const node = state.elTreeRef.getNode(key)
    if(node.data.isLeaf){
        const parentKey = node.parent.key
        state.elTreeRef.updateKeyChildren(parentKey, data)
        state.elTreeRef.setCurrentKey(parentKey)
    }else{
        state.elTreeRef.updateKeyChildren(key, data)
    }
}

function nodeClickHandler(data: FilesTreeNode, node: CustomNode, tree: typeof ElTree, e: MouseEvent) {
    // node.isLeaf is origin method of element-plus, node.data.isLeaf is custom property;
    if (node.isLeaf && node.data.isLeaf) {
        setOpenedDoc(data.path)
    }
}

function setOpenedDoc(path: string) {
    if (!state.openedNodes.some((node) => node.data.path == path)) {
        request.getAditorFile({ path }).then((res) => {
            if(res.data.status){
                const openedNode = state.elTreeRef.getNode(path) as CustomNode
                state.openedNodes.push(openedNode)
                openedNode.data.docJson = res.data.doc
                openedNode.data.isChanged = false
                state.openedNode = state.openedNodes.find((node) => node.data.path == path) || {} as CustomNode;
                state.elTreeRef.setCurrentKey(path)
            }else{
                console.warn(res.data.message)
            }
        }).catch((res)=>{
            console.warn(res)
        })
    }else{
        state.openedNode = state.openedNodes.find((node) => node.data.path == path) || {} as CustomNode;
        state.elTreeRef.setCurrentKey(path)
    }

}

const openedNodePath = computed({
    get() {
        return state.openedNode?.data ? state.openedNode.data.path : ''
    },
    set(newValue: string) {
        setOpenedDoc(newValue)
    }
})

function mountElTreeRef(tree: any) {
    state.elTreeRef = tree
}

function closeOpenedDoc(path: string) {
    // fix bug: if state.openedNode is null, it will cause error
    // so we need to check it first,if null, return
    if(!state.openedNode?.data?.path){
        return
    }
    if(state.openedNode.data.path == path){
        state.openedNodes.forEach((node, index)=>{
            if(node.data.path === path){
                state.openedNode = state.openedNodes[index+1] || state.openedNodes[index-1] || {} as CustomNode
                if(state.openedNode?.data?.path){
                    setOpenedDoc(state.openedNode.data.path)
                }
            }
        })
    }
    state.openedNodes = state.openedNodes.filter((node) => node.data.path != path)
}

async function newFolder(name:string): Promise<boolean>{
    const path = state.elTreeRef.getCurrentKey()
    const sendPath = fixPath(path)
    const newResult = await request.newFolder({path: sendPath, name}).then((res)=>{
        if(res.data.status){
            return true
        }else{
            console.warn(res.data?.message)
        }
        return false
    }).catch((res)=>{
        console.warn(res)
        return false
    })

    if(newResult){
        const childNodes = await _getFiles(path)
        _updateKeyChildren(path, childNodes)
    }

    return newResult
}

async function newFile(name: string): Promise<boolean>{
    // if name not end with .ai, add .ai
    if(!name.endsWith('.ai')){
        name = name + '.ai'
    }

    const path = state.elTreeRef.getCurrentKey()
    let sendPath = fixPath(path)
    const newResult = await request.newFile({path:sendPath, name, version, egbenz_version}).then((res)=>{
        if(res.data.status){
            return true
        }else{
            console.warn(res.data?.message)
        }
        return false
    }).catch((res)=>{
        console.warn(res)
        return false
    })

    if (newResult) {
        const childNodes = await _getFiles(path)
        _updateKeyChildren(path, childNodes)
    }
    return newResult

}

async function refreshFolder(){
    const setKeys = state.elTreeRef.getCurrentKey()
    const paths = getExpandedNode(state.elTreeRef)
    request.refresh({paths}).then((res)=>{
        if(res.data.status){
            for(let i in res.data.folders){
                const childNodes = res.data.folders[i].files.map((file: { name: string, type: string, path: string}) => {
                    return _makeFolderData(res.data.folders[i].path, file)
                })
                _updateKeyChildren(res.data.folders[i].path, childNodes)
            }
            try{
                state.elTreeRef.setCurrentKey(setKeys)
            }catch(e){
                console.warn(e)
            }
        }else{
            console.warn(res.data.message)
        }
    }).catch((res)=>{    
        console.warn(res)
    })
}

async function renamePath(node: CustomNode, newName: string){
    const path = node?.data?.path
    if(!path){
        return false
    }
    const sendPath = fixPath(path)
    const renameResult = await request.renamePath({path:sendPath, name:newName}).then((res)=>{
        if(res.data.status){
            return true
        }else{
            console.warn(res.data?.message)
        }
        return false
    }).catch((res)=>{
        console.warn(res)
        return false
    })

    if(renameResult){
        const parentKey = state.elTreeRef.getNode(path).parent.key
        const childNodes = await _getFiles(parentKey)
        _updateKeyChildren(parentKey, childNodes)
    }

    // update openedNode's name and path if it is opened
    if(state.openedNode?.data?.path == path){
        state.openedNode.data.label = newName
        state.openedNode.data.path = path.replace(/[^/]+$/, newName)
    }

    return renameResult
}

async function deletePath(node: CustomNode){
    const path = node?.data?.path
    if(!path){
        return false
    }
    const deleteResult = await request.deletePath({path}).then((res)=>{
        if(res.data.status){
            return true
        }else{
            console.warn(res.data?.message)
        }
        return false
    }).catch((res)=>{
        console.warn(res)
        return false
    })

    if(deleteResult){
        const parentKey = state.elTreeRef.getNode(path).parent.key
        const childNodes = await _getFiles(parentKey)
        _updateKeyChildren(parentKey, childNodes)
    }

    // close the doc if it is opened
    closeOpenedDoc(path)

    return deleteResult
}

async function updateFile(path: string, view: AditorDocView){
    const doc = view.docState.exportJSON()
    const updateResult = await request.updateFile({path, doc}).then((res)=>{
        if(res.data.status){
            return true
        }else{
            console.warn(res.data?.message)
        }
        return false
    })

    if(updateResult){
        // first set isChanged to false 
        const openedNode = state.openedNodes.find((node) => node.data.path == path)
        if(openedNode){
            openedNode.data.isChanged = false
            request.getAditorFile({ path }).then((res) => {
                if(res.data.status){
                    openedNode.data.docJson = res.data.doc
                }else{
                    console.warn(res.data.message)
                }
            }).catch((res)=>{
                console.warn(res)
            })
        }
    }
}

function getExpandedNode(tree: typeof ElTree){
    let maxLoop = 100000
    if(tree?.root?.constructor?.name !== '_Node'){
        return []
    }
    const root = tree.root
    const expandedNodes = []
    const stack = [root]
    while(stack.length > 0 && maxLoop-- > 0){
        const node = stack.pop()
        if(node && node.expanded){
            expandedNodes.push(node.data.path)
        }
        if(node && node.childNodes){
            stack.push(...node.childNodes)
        }
    }
    // Remove '所有笔记', because it is the root node, if it is refreshed, it will cause the element-tree component to be abnormal
    expandedNodes.shift()
    // reverse expandedNodes, because the expandedNodes is the order of the last expanded node to the first expanded node     
    expandedNodes.reverse()

    return expandedNodes
}

function updateContextMenuNode(node: CustomNode){
    state.lastContextMenuNode = node
}

function afterUpdateView(path: string, _newState:AditorDocState){
    // 从openedNodes中找到对应的node
    const openedNode = state.openedNodes.find((node) => node.data.path == path)
    if(!openedNode){
        return
    }
    let isChanged = false
    const _dfsObjectDiff = (before:any, after:any) => {
        if(Array.isArray(before)){
            if(before.length !== after.length){
                isChanged = true
                return
            }
        }else if(typeof before === 'object' && before !== null && before !== undefined && after !== null && after !== undefined){
            if(Object.keys(before).length !== Object.keys(after).length){
                isChanged = true
                return
            }
        }
        if((Array.isArray(before) || typeof before === 'object') && before !== null && before !== undefined && after !== null && after !== undefined){
            for (let key in before) {
                if(isChanged){
                    return 
                }
                _dfsObjectDiff((before as {[key:string]: any})[key], (after as {[key:string]: any})[key])
            }
        }else{
            if(before !== after){
                isChanged = true
            }
            return 
        }
    }
    
    const _dfsDiff = (before:any, after:any) => {
        if(before.name !== after.name || before.type !== after.type || before.children.length !== after.children.length || before.text !== after.text){
            isChanged = true
        }

        _dfsObjectDiff(before.data, after.data)
        if(isChanged){
            return
        }

        for(let i = 0; i < before.children.length; i++){
            if(isChanged){
                return
            }else{
                _dfsDiff(before.children[i], after.children[i])
            }
        }
    }

    _dfsDiff(toRaw(openedNode.data.docJson), toRaw(_newState.root))
    // find the node by path
    openedNode.data.isChanged = isChanged
}

const fixPath = (path:string)=>{
    // 如果path = '所有笔记' 添加'/'在末尾修正为'所有笔记/'
    if(path == FIXED_ROOT){
        return FIXED_ROOT + '/'
    }else{
        return path
    }
}

export default {
    state, 
    loadNode,
    nodeClickHandler,
    setOpenedDoc,
    openedNodePath,
    mountElTreeRef,
    closeOpenedDoc,
    newFolder,
    newFile,
    refreshFolder,
    renamePath,
    deletePath,
    updateFile,
    updateContextMenuNode,
    afterUpdateView
};
