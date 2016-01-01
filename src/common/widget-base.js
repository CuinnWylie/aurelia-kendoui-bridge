import {pruneOptions} from './options';
import {fireKendoEvent} from './events';
import {getEventsFromAttributes, _hyphenate, getBindablePropertyName} from './util';
import {TemplateCompiler} from './template-compiler';
import {TaskQueue} from 'aurelia-framework';
import {Container} from 'aurelia-dependency-injection';

/**
* Abstraction of commonly used code across wrappers
*/
export class WidgetBase {

  /**
  * the Kendo widget after initialization
  */
  widget: any;

  /**
  * The element of the custom element, or the element on which a custom attribute
  * is placed. DOM events will be raised on this element
  */
  element: Element;

  /**
  * Used to prevent race conditions when events are raised before
  * all bindings have been updated.
  */
  taskQueue: TaskQueue;

  /**
  * The element on which a Kendo widget is initialized
  * This is the "element" by default
  */
  target: Element;

  /**
  * The Kendo control's name, such as kendoGrid or kendoButton
  */
  controlName: string;

  /**
  * The parent context (used for template compilation)
  */
  $parent: any;

  /**
  * The templating compiler adaptor
  */
  templateCompiler: TemplateCompiler;

  constructor(controlName: string, element: Element) {
    // access root container
    let container = Container.instance;
    this.taskQueue = container.get(TaskQueue);
    this.templateCompiler = container.get(TemplateCompiler);
    this.templateCompiler.initialize();

    this.element = element;

    this.target = this.element;

    this.controlName = controlName;

    // the BindableProperty's are created by the generateBindables decorator
    // but the values of the bindables can only be set now the class has been
    // instantiated
    this.setDefaultBindableValues();
  }


  bind(ctx) {
    this.$parent = ctx;
  }

  /**
  * collects all options objects
  * calls all hooks
  * then initialized the Kendo control as "widget"
  */
  _initialize() {
    if (!this.$parent) {
      throw new Error('$parent is not set. Did you call bind(ctx) on the widget base?');
    }

    // get the jQuery selector of the target element
    let target = jQuery(this.target);

    // get the constructor of the Kendo control
    // equivalent to jQuery("<div>").kendoChart
    let ctor = target[this.controlName];

    // generate all options, including event handlers
    let options = this._getOptions(ctor);

    // before initialization callback
    // allows you to modify/add/remove options before the control gets initialized
    this._beforeInitialize(options);

    // instantiate the Kendo control, pass in the target and the options
    this.widget = ctor.call(target, options).data(this.controlName);

    this.widget._$parent = this.$parent;

    this._initialized();
  }

  /**
  * hook that allows a wrapper to modify options before
  * the Kendo control is initialized
  * @param options the options object that a wrapper can modify
  */
  _beforeInitialize(options) {

  }

  /**
  * hook that allows a wrapper to take actions after the widget is initialized
  */
  _initialized() {

  }

  /**
  * Re-initializes the control
  */
  recreate() {
    this._initialize();
  }

  /**
  * combines all options objects and properties into a single options object
  */
  _getOptions(ctor) {
    let options = this.getOptionsFromBindables();
    let eventOptions = this.getEventOptions(ctor);

    // merge all option objects together
    // - options property on the wrapper
    // - options compiled from all the bindable properties
    // - event handler options
    return Object.assign({}, this.options, pruneOptions(options), eventOptions);
  }

  /**
  * loops through all bindable properties generated by the @generateBindables decorator
  * and puts all these values in a single options object
  */
  getOptionsFromBindables() {
    let props = jQuery.fn[this.controlName].widget.prototype.options;
    let options = {};

    for (let prop of Object.keys(props)) {
      options[prop] = this[getBindablePropertyName(prop)];
    }

    if (this.kDataSource) {
      options.dataSource = this.kDataSource;
    }

    return options;
  }

  /**
  * sets the default value of all bindable properties
  *  gets the value from the options object in the Kendo control itself
  */
  setDefaultBindableValues() {
    let props = jQuery.fn[this.controlName].widget.prototype.options;

    for (let prop of Object.keys(props)) {
      this[getBindablePropertyName(prop)] = props[prop];
    }
  }

  /**
  * convert attributes into a list of events a user wants to subscribe to.
  * These events are then subscribed to, which when called
  * calls the fireKendoEvent function to raise a DOM event
  */
  getEventOptions(ctor) {
    let options = {};
    let allowedEvents = ctor.widget.prototype.events;

    // iterate all attributes on the custom elements
    // and only return the normalized kendo event's (dataBound etc)
    let events = getEventsFromAttributes(this.element);

    events.forEach(event => {
      // throw error if this event is not defined on the Kendo control
      if (!allowedEvents.includes(event)) {
        throw new Error(`${event} is not an event on the ${this.controlName} control`);
      }

      // add an event handler 'proxy' to the options object
      options[event] = e => {
        this.taskQueue.queueMicroTask(() => {
          fireKendoEvent(this.target, _hyphenate(event), e);
        });
      };
    });

    return options;
  }

  /**
  * destroys the widget when the view gets detached
  */
  detached() {
    if (this.widget) {
      this.widget.destroy();
    }
  }
}
