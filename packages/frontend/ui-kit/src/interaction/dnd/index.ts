/**
 * Drag and drop, for the kit and the app alike (pragmatic-drag-and-drop: native HTML5 drag).
 *
 * The app takes these from the kit, not from the library: the library keeps its registry of
 * draggables, drop targets and monitors in module state, and two copies of it would not see each
 * other's drags. Through one copy, a row dragged out of a kit Tree reaches the app's drop targets,
 * and the app's draggables reach the Tree (`accept`).
 */
export {
  draggable,
  dropTargetForElements,
  monitorForElements,
  type ElementDragPayload,
  type ElementDropTargetEventBasePayload,
  type ElementEventBasePayload,
} from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter';
export { combine } from '@atlaskit/pragmatic-drag-and-drop/utils/combine';
export { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';

export { defineDragType, type DragData, type DragType } from './dragType';
