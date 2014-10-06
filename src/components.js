(function (root, factory) {

    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(factory);
    } else {
        // Browser globals
        root.components = factory();
    }

}(this, function () {

    var win = window;
    var doc = win.document;
    var slice = [].slice;
    var filter = [].filter;
    var map = [].map;

    // try and detect a DOM library eg. jQuery, Zepto etc...
    var $ = win.jQuery || win.Zepto || win.$;

    /**
     * Map of component name -> component Class
     * @type {Object}
     */
    var componentClasses = {};

    /**
     * Map of component id -> component instance
     * @type {Object}
     */
    var componentInstances = {};

    /**
     * Map of event name -> handlers for that event
     * @type {Object}
     */
    var globalHandlers = {};

    /**
     * Incrementing number used to give each component a unique id.
     * @type {Number}
     */
    var nextComponentId = 1;

    var dataPrefix = 'data-component-';
    var dataComponentNameAttribute = dataPrefix + 'name';
    var dataComponentIdAttribute = dataPrefix + 'id';

    /**
     * Map of event name -> flag indicating whether or not to use useCapture
     * @type {Object}
     */
    var allEvents = {
        click: false,
        dblclick: false,
        mousedown: false,
        mouseup: false,
        mousemove: false,
        mouseleave: false,
        touchstart: false,
        touchmove: false,
        touchend: false,
        keyup: false,
        keydown: false,
        error: true,
        blur: true,
        focus: true,
        scroll: true,
        submit: true,
        change: true,
        resize: true,
        mouseenter: true
    };

    /**
     * Returns the 'inner' type of `obj`.
     * @param {*} obj
     * @returns {String}
     */
    function type (obj) {
        return Object.prototype.toString.call(obj).match(/\[object (.*?)\]/)[1].toLowerCase();
    }

    /**
     * Returns true if `obj` is an Object.
     * @param {*} obj
     * @returns {Boolean}
     */
    function isObject(obj) {
        return type(obj) === 'object';
    }

    /**
     * Returns true if `fn` is a function.
     * @param fn
     * @returns {Boolean}
     */
    function isFunction (fn) {
        return type(fn) === 'function';
    }

    /**
     * Returns true if `el` is an element.
     * @param el
     * @returns {Boolean}
     */
    function isElement (el) {
        return el && (el.nodeType === 1 || el.nodeType === 9);
    }

    /**
     * Returns true if `str` is a string.
     * @param {*} str
     * @returns {Boolean}
     */
    function isString (str) {
        return type(str) === 'string';
    }

    /**
     * Returns `this`. Used as a placeholder method.
     * @returns {*}
     */
    function noop () {
        return this;
    }

    /**
     * Returns a camel-cased version of `str`.
     * @param {String} str
     * @returns {String}
     */
    function toCamelCase (str) {
        return str.replace(/\-(.)/g, function (a,b) {
            return b.toUpperCase();
        });
    }

    /**
     * Mixes all arguments after `target` into `target` and returns `target`.
     * @param {Object} target
     * @returns {Object}
     */
    function extend (target) {

        slice.call(arguments, 1).forEach(function (source) {
            if (isObject(source)) {
                for (var key in source) {
                    if (source.hasOwnProperty(key)) {
                        target[key] = source[key];
                    }
                }
            }
        });

        return target;
    }

    /**
     * Returns the closest element to el that matches the given selector.
     * @param {HTMLElement} el
     * @param {String} selector
     * @returns {HTMLElement|Null}
     */
    function closestElement (el, selector) {

        if ($) {
            return $(el).closest(selector)[0];
        }

        while (el && el !== doc.body) {

            if (matches(el, selector)) {
                return el;
            }

            el = el.parentElement;
        }

        return null;
    }

    /**
     * Wrapper around the HTMLElement.prototype.matches
     * method to support vendor prefixed versions.
     * @param {HTMLElement} el
     * @param {String} selector
     * @returns {Boolean}
     */
    function matches (el, selector) {

        var method = 'MatchesSelector';
        var matchesSelector = el['webkit' + method] ||
            el['moz' + method] ||
            el['ms' + method] ||
            el['o' + method] ||
            el.matchesSelector ||
            el.matches;

        return matchesSelector.call(el, selector);
    }

    /**
     * Returns the nearest Component instance for the passed element.
     * @param {HTMLElement} element
     * @param {Boolean} [ignoreRoot] If true
     * @returns {Component[]}
     */
    function parentComponents(element, ignoreRoot) {

        var id;
        var result = [];

        // Quick return for window or document
        if (element === win || element === doc) {
            return [];
        }

        if (ignoreRoot) {
            element = element.parentElement;
        }

        while (isElement(element)) {

            id = element.getAttribute(dataComponentIdAttribute);

            if (id && componentInstances[id]) {
                result.push(componentInstances[id]);
            }

            element = element.parentElement;
        }

        return result;
    }

    /**
     * Returns the Component instance for the passed element or null.
     * If a component instance has already been created for this element
     * then it is returned, if not a new instance of the correct Component is created.
     * @param {HTMLElement} el
     */
    function fromElement(el) {

        var name;
        var id;

        if (!isElement(el)) {
            return null;
        }

        name = el.getAttribute(dataComponentNameAttribute);
        id = el.getAttribute(dataComponentIdAttribute);

        // if no name then it is not a component
        if (!name) {
            return null;
        }

        // if there is an id we must already have a component instance
        if (id) {
            return componentInstances[id];
        }

        if (!componentClasses[name]) {
            throw Error('No component has been registered with name ' + name);
        }

        // create a new Component instance
        return new componentClasses[name](el);
    }

    /**
     * Given an array of Component instances invokes 'method' on each one.
     * Any additional arguments are passed to the method.
     * @param {Component[]|Component} components
     * @param {String} method
     */
    function invoke(components, method) {

        var args = slice.call(arguments, 2);
        var i = 0;
        var length;

        if (isComponent(components)) {
            components = [components];
        }

        if (!components) {
            return this;
        }

        for (length = components.length; i < length; i++) {
            if (isFunction(components[i][method])) {
                components[i][method].apply(components[i], args);
            }
        }

        return this;
    }

    /**
     * Given an element returns an object containing all data-* attributes
     * except for data-component-name and data-component-id.
     *
     * Runs all values through JSON.parse() so it is possible to pass
     * structured data to component instances through data-* attributes.
     * @param {HTMLElement} el
     * @returns {Object}
     */
    function parseDataAttributes(el) {

        var result = {};
        var name;
        var value;

        for (var i = 0; i < el.attributes.length; i++) {

            name = toCamelCase(el.attributes[i].name);

            if (name.substring(0, 19) === 'dataComponentOption') {

                name = name[19].toLowerCase() + name.substring(20);
                value = el.attributes[i].value;

                try {
                    value = JSON.parse(value);
                }
                catch (e) {
                }

                result[name] = value;

            }

        }

        return result;
    }

    /**
     * Returns true if component is an instance of Component.
     * @param component
     * @returns {boolean}
     */
    function isComponent(component) {
        return component instanceof Component;
    }

    /**
     * Handles all events - both standard DOM events and custom Component events.
     *
     * Finds all component instances that contain the 'target' and if they have an event
     * handler for this event it is called. Components closer to the target are called first.
     *
     * If the event is a DOM event then the event target is the 'target' property of the event.
     * If the event is a custom Component event then the target is the component that emitted the event.
     *
     * @param {Event} event
     * @param {Component[]} [componentsChain] Only used internally when a chain of
     *                                        Components is already available.
     */
    function handleEvent(event, componentsChain) {

        // this will be a DOM element or a Component
        // component event objects are created in Component.prototype.emit
        var target = event.target;

        // we need to know if the target is a DOM element or a component instance
        var targetIsComponent = isComponent(target);

        // if it is a component instance we need the name
        var targetComponentName = targetIsComponent ? target.name : null;
        var type = event.type;

        // this will be the name of the event
        var eventName = event.type;

        var component, events, closest, selector;
        var eventType, method, handlers, i, j, length, eventsLength;

        // We now need to make sure we have the chain of components above the target,
        // There are three cases here:
        // 1. We already have a component chain (internal use)
        // 2. The target is a component, in which case we get the element from the 'el' property
        // 3. The target is a DOM element
        // The second argument passed to parentComponents tells it whether or not to include
        // in the returned array the Component instance attached to the root element. If this is
        // a component triggered event we do not want to try and find a handler on the same instance.
        if (!componentsChain) {
            componentsChain = parentComponents(
                targetIsComponent ? target.el : target, targetIsComponent
            );
        }

        for (i = 0, length = componentsChain.length; i < length; i++) {

            component = componentsChain[i];
            events = component._events;

            // if component has no events continue to next component
            if (!events) {
                continue;
            }

            for (j = 0, eventsLength = events.length; j < eventsLength; j++) {

                eventType = events[j][0];
                selector = events[j][1];
                method = events[j][2];

                // if event doesn't match then go to next component
                if (eventType !== eventName) {
                    continue;
                }

                // if there is no selector just invoke the handler and move on
                if (!selector) {
                    method.call(component, event);
                    continue;
                }

                // if this is a component event then the
                // selector just needs to match the component name
                if (targetIsComponent) {

                    // if component name matches call the handler
                    if (selector === targetComponentName) {
                        method.call(component, event);
                    }

                }
                else {

                    // see if the selector matches the event target
                    closest = closestElement(target, selector);

                    // if it does then call the handler passing the matched element
                    if (closest) {
                        method.call(component, event, closest);
                    }

                }

            }

        }

        // Now all component events have been handled we need to handler 'global'
        // events that have been subscribed to using 'setGlobalHandler'.
        // This is supported for components that need to listen to events on the body/document/window.
        handlers = globalHandlers[eventName];

        // if there are no handlers we are done
        if (!handlers) {
            return;
        }

        // call the global handlers
        for (i = 0, length = handlers.length; i < length; i++) {
            handlers[i].fn.call(handlers[i].ctx, event, doc.body);
        }
    }

    /**
     * Parses the given element or the root element and creates Component instances.
     * @param {HTMLElement} [root]
     * @returns {Component[]}
     */
    function parse(root) {

        // allow DOM element or nothing
        root = isElement(root) ? root : doc.body;

        var els = slice.call(root.querySelectorAll('[' + dataComponentNameAttribute + ']'));
        var component;

        // add the root element to the front
        els.unshift(root);

        return els.reduce(function (result, el) {

            component = fromElement(el);

            if (component) {
                result.push(component);
            }

            return result;

        }, []);
    }

    /**
     * Registers a new Component.
     * @param {String|Object} name
     * @param {Object} [impl] The implementation methods / properties.
     * @returns {Function}
     */
    function register(name, impl) {

        var F, Surrogate;

        if (isObject(name)) {
            impl = name;
            name = impl.name;
        }

        if (!isString(name) || !name) {
            throw Error('"' + name + '" is not a valid component name');
        }

        if (componentClasses[name]) {
            throw Error('A component called ' + name + ' already exists');
        }

        impl = impl || {};

        F = function () {
            Component.apply(this, arguments);
        };

        Surrogate = function () {};
        Surrogate.prototype = Component.prototype;
        F.prototype = new Surrogate();
        F.prototype.name = name;

        extend(F.prototype, impl);

        componentClasses[name] = F;
        return F;
    }

    /**
     * Un-registers a Component class and destroys any existing instances.
     * @param {string} name
     */
    function unregister(name) {
        destroy(name);
        componentClasses[name] = null;
    }

    /**
     * Binds all events to the body.
     */
    function bindEvents() {

        var key, el;

        for (key in allEvents) {

            // special case for resize and scroll event to listen on window
            el = ['resize', 'scroll'].indexOf(key) !== -1 ? window : doc.body;

            el.addEventListener(key, handleEvent, !!allEvents[key]);
        }

    }

    /**
     */
    function init() {
        parse();
        bindEvents();
    }

    /**
     * @param {string} name
     * @returns {Object}
     */
    function getInstanceOf(name) {
        return getInstancesOf(name)[0];
    }

    /**
     * @param {string} name
     * @param {function} filter
     * @returns {Array}
     */
    function getInstancesOf(name) {

        var result = [];

        for (var key in componentInstances) {
            if (componentInstances[key] && componentInstances[key].name === name) {
                result.push(componentInstances[key]);
            }
        }

        return result;
    }

    /**
     * @param {string} name
     * @returns {components|Component}
     */
    function destroy(name) {
        getInstancesOf(name).forEach(function(instance) {
            instance.destroy();
        });

        return this;
    }

    /**
     * Creates a new Component
     * @param element
     * @param options
     * @constructor
     */
    function Component (element, options) {

        if (arguments.length === 1 && isObject(element)) {
           options = element;
           element = this.createRootElement();
        }

        if (!arguments.length) {
            element = this.createRootElement();
        }

        this._id = nextComponentId++;
        componentInstances[this._id] = this;

        this.el = element;

        if ($) {
            this.$el = $(element);
        }

        // options are built from optional default options - this can
        // be a property or a function that returns an object, the
        // data-component-option attributes, and finally any options
        // passed to the constructor
        this.options = extend(
            {},
            isFunction(this.defaultOptions) ? this.defaultOptions() : this.defaultOptions,
            parseDataAttributes(this.el),
            options
        );

        if (this.options.template) {
            this.template = this.options.template;
        }

        element.setAttribute(dataComponentNameAttribute, this.name);
        element.setAttribute(dataComponentIdAttribute, this._id);

        this._events = [];

        this.init();

        this.setupEvents(this.registerEvent.bind(this));

        // Backwards compatibility - remove when no components use 'events' hash anymore
        if (isObject(this.events)) {
            for (var key in this.events) {
                var parts = key.split(':');
                this._events.push([
                    parts.length > 1 ? parts[1] : parts[0],
                    parts.length > 1 ? parts[0] : null,
                    this[this.events[key]]
                ]);
            }
        }

        this.render();
    }

    Component.prototype = {

        name: '',

        tagName: 'div',

        /**
         * If set to a function it will be called with the
         * component as both 'this' and as the first argument.
         */
        template: null,

        /**
         * The init function will be called when the Component is created.
         * This maybe be through the parsing of DOM or through directly creating the component.
         * @returns {Component}
         */
        init: function () {
            return this;
        },

        setupEvents: noop,

        /**
         * Renders the contents of the component into the root element.
         * @returns {Component}
         */
        render: function () {
            var template = this.template;
            var templateIsFunction = isFunction(template);
            var templateIsString = isString(template);

            if (templateIsFunction || templateIsString) {
                this.el.innerHTML = templateIsFunction ? template(this) : template;
                this.parse();
            }

            return this;
        },

        /**
         * Parses this Component and instantiates any child components
         * @returns {Component}
         */
        parse: function () {
            parse(this.el);
            return this;
        },

        /**
         * Emits an event that parent Components can listen to.
         * @param name The name of the event to emit
         * @param [data] Event data
         * @param [chain] Array of parent Components
         */
        emit: function (name, data, chain) {

            data = data || {};
            data.target = this;
            data.type = name;
            data.customEvent = true;

            handleEvent(data, chain);
        },

        /**
         * Appends this Component to an element.
         * @param {HTMLElement} el
         * @returns {Component}
         */
        appendTo: function (el) {

            el = isElement(el) ? el : isComponent(el) ? el.el : null;

            if (!el) {
                return this;
            }

            this.beforeInsert();
            el.appendChild(this.el);
            this.onInsert();
            this.emit('inserted');
            return this;
        },

        /**
         * Called before the Component in inserted into the DOM.
         */
        beforeInsert: noop,

        /**
         * Called after the Component is inserted into the DOM.
         */
        onInsert: noop,

        /**
         * Removes this component from the DOM.
         * @returns {Component}
         */
        remove: function (chain) {

            // cannot be removed if no element or no parent element
            if (!this.el || !this.el.parentElement) {
                return this;
            }

            // get the chain of parent components if not passed
            chain = chain || parentComponents(this.el, true);

            // get all the child Components and invoke beforeRemove
            var children = parse(this.el);
            invoke(children, 'beforeRemove');

            // actually remove the element
            this.el.parentElement.removeChild(this.el);

            // invoke onRemove and emit remove event
            invoke(children, 'onRemove');
            this.emit('remove', null, chain);
            return this;
        },

        /**
         * Called before this Component is removed from the DOM.
         */
        beforeRemove: noop,

        /**
         * Called after this Component is removed from the DOM.
         */
        onRemove: noop,

        /**
         * Removes this Component from the DOM and deletes the instance from the instances pool.
         * Null is returned for convenience so it is easy to get rid of references to a Component.
         *    this.component = this.component.destroy();
         * @returns {null}
         */
        destroy: function () {

            var chain;

            // must have already been destroyed
            if (!componentInstances[this._id]) {
                return null;
            }

            // get the parent chain of Components
            chain = parentComponents(this.el, true);

            // invoke remove passing the chain
            this.remove(chain);

            // invoke before beforeDestroy on all child Components
            invoke(parse(this.el), 'beforeDestroy');

            // emit the destroy event passing the chain
            this.emit('destroy', null, chain);

            // destroy everything
            this.el = null;

            // use null assignment instead of delete
            // as delete has performance implications
            componentInstances[this._id] = null;

            return null;
        },

        /**
         * Called before this Component is destroyed.
         */
        beforeDestroy: noop,

        /**
         * In the case that this Component is created directly by invoking the constructor with
         * no element this method will be called to create the root element.
         * @returns {HTMLElement}
         */
        createRootElement: function () {
            return doc.createElement(this.tagName);
        },

        /**
         * Convenience method for performing querySelector within
         * the context of this Component.
         * @param {String} selector
         * @returns {Array}
         */
        find: function (selector) {

            if (this.$el) {
                return this.$el.find(selector);
            }

            return this.el ? slice.call(this.el.querySelectorAll(selector)) : [];
        },

        /**
         * Returns the first component with 'name' within this Component or null.
         * @param {String} name
         * @returns {Component|Null}
         */
        findComponent: function (name) {
            return fromElement(
                this.find('[' + dataComponentNameAttribute + '=' + name + ']')[0]
            );
        },

        /**
         * Returns all components with 'name' within this component.
         * If no components exist with this name an empty array will be returned.
         * @param name
         * @returns {Component[]}
         */
        findComponents: function (name) {
            return map.call(
                this.find('[' + dataComponentNameAttribute + '=' + name + ']'),
                fromElement
            );
        },

        invoke: invoke,

        /**
         * Registers an event that this component would like to listen to.
         * @param {string} event
         * @param {string|function} selector
         * @param {function} [handler]
         * @returns {Component}
         */
        registerEvent: function (event, selector, handler) {

            if (arguments.length === 2) {
                handler = selector;
                selector = null;
            }

            this._events.push([event, selector, handler]);
            return this;
        },

        /**
         * Set a global event handler. This is useful when you
         * need to listen to events that happen outside this component.
         * @param {String} event
         * @param {Function} fn
         * @returns {Component}
         */
        setGlobalHandler: function (event, fn) {
            globalHandlers[event] = globalHandlers[event] || [];

            globalHandlers[event].push({
                fn: fn,
                ctx: this
            });

            return this;
        },

        /**
         * Release a global event handler that was previously set with setGlobalHandler().
         * @param {String} event
         * @param {Function} fn
         * @returns {Component}
         */
        releaseGlobalHandler: function (event, fn) {

            var handlers = globalHandlers[event];

            if (!handlers) {
                return this;
            }

            globalHandlers[event] = filter.call(handlers, function (handler) {
                return handler.fn !== fn;
            });

            return this;
        },

        /**
         * Scroll the window to the component.
         */
        scrollTo: function () {

            if (this.$el) {
                window.scrollTo(0, this.$el.position().top);
            }
            else {
                window.scrollTo(0, this.el.getBoundingClientRect().top + window.scrollY);
            }

        }

    };

    // public API
    return {
        Component: Component,
        init: init,
        bindEvents: bindEvents,
        handleEvent: handleEvent,
        parse: parse,
        register: register,
        unregister: unregister,
        fromElement: fromElement,
        isComponent: isComponent,
        getInstancesOf: getInstancesOf,
        getInstanceOf: getInstanceOf,
        destroy: destroy
    };

}));
