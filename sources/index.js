import dom from '@alexistessier/dom'
import delegate from 'component-delegate'
import {isString, isNull, isNumber, isObject, kebabCase, camelCase, isFunction, forEach} from 'lodash'

let UIComponent_Node_Map = new WeakMap();
let UIComponent_unique_ID = 0;

let eventListenerIdentifierCounter = 0;

let defaultEventDelegationRootCache = null;
let defaultEventDelegationRoot = function (cache) {
	return cache || (cache = dom.selectOne('body'));
};

class UIComponent {
	constructor({
		switchStateMethodPrefix = 'state',
		eventDelegationRoot = defaultEventDelegationRoot(defaultEventDelegationRootCache),
		cssClass = this.className,
		renderMethod = this.renderingMethod
	}={}) {
		this.option = {
			switchStateMethodPrefix,
			eventDelegationRoot,
			cssClass,
			renderMethod
		};

		this.cssClass = cssClass;
		this.renderMethod = renderMethod;

		this.descendant = {};
		this.data = {};
		this.eventListener = {};
		this.componentId = UIComponent_unique_ID++;
	}

	inject({
		eventDelegationService = delegate
	}={}){
		this.eventDelegationService = eventDelegationService;
		
		return this;
	}

	init(node, model = {}){
		this.node = node;
		
		this.model = model;

		this.renderView();

		return this;
	}

	eventCallback(callback, event, target){
		if (isFunction(callback)) {
			callback(event, target);
		}
		else if (isFunction(this[callback])) {
			this[callback](event, target);
		}
	}

	render(){
		let render = this.renderingMethod;
		if (isFunction(render)) {
			return render(this.model);
		}
		return this.node ? this.node.outerHTML : '<div class="'+this.className+'"></div>';
	}

	renderView(){
		if (!this.node) {
			let rootNode = dom.createDiv();
			rootNode.innerHTML = this.render();
			this.node = rootNode.firstChild;
		}
		
		if(this.node){
			dom.setData(this.node, 'ui-component-id', this.componentId);
			UIComponent_Node_Map.set(this.node, this);
		}

		return this.node;
	}

	appendView(parent){
		dom.appendChild(parent, this.node);
	}

	prependView(parent){
		dom.prependChild(parent, this.node);
	}

	removeView(){
		dom.remove(this.node);
	}

	remove(){
		this.removeView();
		UIComponent.domMap.has(this.node) ? UIComponent.domMap.delete(this.node) : null;
		this.off();
		this.descendant = {};

		return null;
	}

	on(event, descendantName = null, callback = null, listenerIdentifier = ('_'+(eventListenerIdentifierCounter++))){
		let eventRoot = this.option.eventDelegationRoot;
		if (isNull(callback)) {
			callback = camelCase(descendantName+'-'+event);
		}
		this.eventListener[event] = this.eventListener[event] || {};
		let fn = null;
		let descendantIsNull = isNull(descendantName);
		if (descendantIsNull || isFunction(descendantName)) {
			let callback = descendantIsNull ? event : descendantName;

			fn = this.eventDelegationService.bind(eventRoot, this.selector, event, (e)=>{
				let target = UIComponent.retrieve(e.delegateTarget);
				if (isObject(target) && target.componentId === this.componentId) {
					this.eventCallback(callback, e, target);
				}
			}, false);

		}
		else{
			let descendantKey = camelCase(descendantName);
			let targetIsRegistered = !!(this.descendant[descendantKey]);
			if (!targetIsRegistered){ eventRoot = this.node; }
			fn = this.eventDelegationService.bind(eventRoot, this.descendantSelector(descendantName), event, (e)=>{
				let target = e.delegateTarget;
				if (!targetIsRegistered || (isObject(target)
					&& dom.getData(target, 'ui-parent-component-id') == this.componentId
					&& dom.getData(target, 'ui-descendant-name') == kebabCase(descendantName))
				) {
					this.eventCallback(callback, e, target);
				}
			}, false);
		}

		if (fn) {
			this.eventListener[event][listenerIdentifier] = {
				fn,
				eventRoot
			};
		}

		return fn;
	}

	off(event = null, listenerIdentifier = null){
		if (listenerIdentifier) {
			let listenerList = this.eventListener[event];
			let fn = isObject(listenerList) ? listenerList[listenerIdentifier] : null;

			if(fn){
				this.eventDelegationService.unbind(fn.eventRoot, event, fn.fn, false);
				delete this.eventListener[event][listenerIdentifier];
			} 
		}
		else if(event){
			let listenerList = this.eventListener[event];
			if (listenerList) {
				forEach(listenerList, (fn, listenerIdentifier)=>{
					this.off(event, listenerIdentifier);
				});

				delete this.eventListener[event];
			}
		}
		else{
			forEach(this.eventListener, (event, eventName)=>{
				this.off(eventName);
			});
		}
	}

	getData(name){
		this.data[name] = dom.getData(this.node, name) || this.data[name];
		return this.data[name];
	}

	setData(name, value){
		this.data[name] = value;
		if(!isObject(value)){
			dom.setData(this.node, name, value);
		}
	}

	is(stateName){
		return dom.hasClass(this.node, stateName);
	}

	state(stateName, newValue){
		let currentValue = this.is(stateName);

		if (newValue !== currentValue) {
			let commonCallBackName = this.option.switchStateMethodPrefix+'-'+stateName+'-';
			let callbackName = camelCase(commonCallBackName+(newValue ? 'on' : 'off'));
			let switchCallbackName = camelCase(commonCallBackName+'switch');
			dom[newValue ? 'addClass' : 'removeClass'](this.node, stateName);
			if(isFunction(this[switchCallbackName])) {
				this[switchCallbackName](newValue);
			}
			if(isFunction(this[callbackName])) {
				this[callbackName](newValue);
			}
		}
	}

	toggleState(stateName){
		this.state(stateName, !this.is(stateName));
	}

	get selector(){
		return '.'+this.className;
	}

	descendantSelector(descendantName){
		return this.selector+'-'+kebabCase(descendantName);
	}

	linkDescendant(key, node){
		if (isObject(node)) {
			dom.setData(node, 'ui-descendant-name', kebabCase(key));
			if (isNumber(node.length)) {
				dom.forEach(node, function (n) {
					dom.setData(n, 'ui-parent-component-id', this.componentId);
				});
			}
			else{
				dom.setData(node, 'ui-parent-component-id', this.componentId);
			}
		}
		return node;
	}

	registerDescendant(name, one = true, key = null){
		key = camelCase(key || name);
		
		let descendant = this.selectDescendant(name, one);
		this.descendant[key] = descendant;

		if (!one) {
			forEach(descendant, el =>{
				this.linkDescendant(key, el);
			});
			return descendant;
		}
		else{
			return this.linkDescendant(key, descendant);
		}
	}

	selectDescendant(name, one = true){
		return this.select(this.descendantSelector(name), one);
	}

	selectDescendantList(name){
		return this.selectDescendant(name, false);
	}

	select(selector, one = true){
		return one ? this.node.querySelector(selector) : this.node.querySelectorAll(selector);
	}

	selectList(selector){
		return this.select(selector, false);
	}

	registerDescendantList(name, key = null){
		return this.registerDescendant(name, false, key);
	}

	getAttribute(name){
		return this.node.getAttribute(name);
	}

	setAttribute(name, value){
		return this.node.setAttribute(name, value);
	}

	get style(){
		return dom.getStyle(this.node);
	}

	set style(style){
		this.setAttribute('style', style);
	}

	get width(){
		return dom.getWidth(this.node);
	}

	get height(){
		return dom.getHeight(this.node);
	}

	get className(){
		return this.cssClass || this.constructor.cssClass || this.constructor.name || (this.node ? this.node.className.split(' ')[0] : (function () {
			throw new Error('Impossible to retrieve the css component class name. You must use the cssClass option or set en cssClass key on the constructor.');
			return null;
		})());
	}

	get renderingMethod(){
		return this.renderMethod || this.constructor.renderMethod || null;
	}
}

UIComponent.domMap = UIComponent_Node_Map;

UIComponent.retrieve = function(node){
	return UIComponent_Node_Map.has(node) ? UIComponent_Node_Map.get(node) : null;
};

export default UIComponent;