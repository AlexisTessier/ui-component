import dom from '@alexistessier/dom'
import delegate from 'component-delegate'
import {isNumber, isObject, kebabCase, camelCase, isFunction, forEach} from 'lodash'

let UIComponent_Node_Map = new WeakMap();
let UIComponent_unique_ID = 0;

let eventListenerIdentifierCounter = 0;

let defaultEventDelegationRoot = dom.selectOne('body');

class UIComponent {
	constructor({
		eventDelegationRoot = defaultEventDelegationRoot,
		cssClass = this.className
	}={}) {
		this.option = {
			eventDelegationRoot,
			cssClass
		};
	}

	inject({
		eventDelegationService = delegate
	}={}){
		this.eventDelegationService = eventDelegationService;
		
		return this;
	}

	init(node){
		this.node = node;
		this.descendant = {};
		this.data = {};
		this.eventListener = {};

		this.componentId = UIComponent_unique_ID++;
		dom.setData(this.node, 'ui-component-id', this.componentId);

		UIComponent_Node_Map.set(this.node, this);

		return this;
	}

	eventCallback(callback, event){
		if (isFunction(callback)) {
			callback(event);
		}
		else{
			this[callback](event);
		}
	}

	on(event, descendantName, callback, listenerIdentifier = ('_'+(eventListenerIdentifierCounter++))){
		this.eventListener[event] = this.eventListener[event] || {};
		let fn = null;
		if (isFunction(descendant)) {
			let callback = descendant;
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
			if(fn){this.eventDelegationService.unbind(this.option.eventDelegationRoot, event, fn, false);}
		}
		else if(event){
			let listenerList = this.eventListener[event];
			if (listenerList) {
				forEach(listenerList, (fn, listenerIdentifier)=>{
					this.off(event, listenerIdentifier);
				});
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

	is(className){
		return dom.hasClass(this.node, className);
	}

	state(className, value){
		dom[value ? 'addClass' : 'removeClass'](this.node, className);
	}

	toggleState(className){
		dom.toggleClass(this.node, className);
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
		return this.linkDescendant(key,
			this.descendant[key] = (one ? this.node.querySelector : this.node.querySelectorAll)(this.descendantSelector(name)));
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

	getStyle(){
		return dom.getStyle(this.node);
	}

	getWidth(){
		return dom.getWidth(this.node);
	}

	getHeight(){
		return dom.getHeight(this.node);
	}

	get className(){
		return this.cssClass || this.constructor.name || (this.node ? this.node.className.split(' ')[0] : (function () {
			throw new Error('Impossible to retrieve the css component class name. You must use the cssClass option.');
			return null;
		})());
	}
}

UIComponent.domMap = UIComponent_Node_Map;

UIComponent.retrieve = function(node){
	return UIComponent_Node_Map.has(node) ? UIComponent_Node_Map.get(node) : null;
};

export default UIComponent;