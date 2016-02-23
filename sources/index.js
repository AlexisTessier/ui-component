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
	}

	inject({
		eventDelegationService = delegate
	}={}){
		this.eventDelegationService = eventDelegationService;
		
		return this;
	}

	init(node, model = {}){
		this.node = node;
		this.descendant = {};
		this.data = {};
		this.eventListener = {};
		this.model = model;

		this.componentId = UIComponent_unique_ID++;
		dom.setData(this.node, 'ui-component-id', this.componentId);

		UIComponent_Node_Map.set(this.node, this);

		this.renderView();

		return this;
	}

	eventCallback(callback, event){
		if (isFunction(callback)) {
			callback(event);
		}
		else if (isFunction(this[callback])) {
			this[callback](event);
		}
	}

	render(){
		let render = this.renderingMethod;
		if (isFunction(render)) {
			return render(this.model);
		}
		return this.node.outerHTML;
	}

	updateView(){
		this.node.outerHTML = this.render();

		return this.node;
	}

	renderView(){
		if (!this.node) {
			this.node = dom.createDiv();
			this.updateView();
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

	on(event, descendantName = null, callback = null, listenerIdentifier = ('_'+(eventListenerIdentifierCounter++))){
		if (isNull(callback)) {
			callback = camelCase(descendantName+'-'+event);
		}
		this.eventListener[event] = this.eventListener[event] || {};
		let fn = null;
		let descendantIsNull = isNull(descendantName);
		if (descendantIsNull || isFunction(descendantName)) {
			let callback = descendantIsNull ? event : descendantName;
			fn = this.eventDelegationService.bind(this.option.eventDelegationRoot, this.selector, event, (e)=>{
				let target = UIComponent.retrieve(e.delegateTarget);
				if (isObject(target) && target.componentId === this.componentId) {
					this.eventCallback(callback, e);
				}
			}, false);
		}
		else{
			fn = this.eventDelegationService.bind(this.option.eventDelegationRoot, this.descendantSelector(descendantName), event, (e)=>{
				let target = e.delegateTarget;
				if (isObject(target)
					&& dom.getData(target, 'ui-parent-component-id') == this.componentId
					&& dom.getData(target, 'ui-descendant-name') == kebabCase(descendantName)
				) {
					this.eventCallback(callback, e);
				}
			}, false);
		}

		if (fn) {
			this.eventListener[event][listenerIdentifier] = fn;
		}

		return fn;
	}

	off(event = null, listenerIdentifier = null){
		if (listenerIdentifier) {
			let listenerList = this.eventListener[event];
			let fn = isObject(listenerList) ? listenerList[listenerIdentifier] : null;
			if(fn){
				this.eventDelegationService.unbind(this.option.eventDelegationRoot, event, fn, false);
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
		let descendantSelector = this.descendantSelector(name);
		let descendant = one ? this.node.querySelector(descendantSelector) : this.node.querySelectorAll(descendantSelector);
		this.descendant[key] = descendant;
		return this.linkDescendant(key, descendant);
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