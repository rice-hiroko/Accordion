(function(){
	"use strict";


	var each          = Array.prototype.forEach;
	var touchEnabled  = "ontouchstart" in document.documentElement;
	var UNDEF;


	/**
	 * Class that represents a single segment in an Accordion object's content.
	 *
	 * @param {HTMLElement} el                   - Outermost element containing both heading and collapsible content.
	 * @param {Object}      options              - Auxiliary hash of options.
	 * @param {String}      options.openClass    - Name of CSS class controlling each fold's visible "open" state 
	 * @param {String}      options.heading      - Selector string for the fold's heading element.
	 * @param {String}      options.content      - Selector string for fold's child element holding togglable content.
	 * @param {Boolean}     options.disableAria  - Disable the addition and management of ARIA attributes.
	 * @param {Boolean}     options.disableKeys  - Disable keyboard navigation
	 */
	function Fold(el, options){
		var THIS        = this;
		var options     = options || {};
		var openClass   = options.openClass || "open";
		var onToggle    = options.onToggle;
		var aria        = !options.disableAria;
		var useKeyNav   = !options.disableKeys;

		var open        = el.classList.contains(openClass);
		var heading     = options.heading ? el.querySelector(options.heading) : el.firstElementChild;
		var content     = options.content ? el.querySelector(options.content) : el.lastElementChild;
		var randomID;

		
		/**
		 * Update the heights of the fold's heading/body and returns the total of each.
		 *
		 * @param {Number} y - Offset to apply to the fold's node, supplied by the containing accordion.
		 * @return {Number}
		 */
		function update(offset){
			var headingBoundingBox  = heading.getBoundingClientRect();
			var headingHeight       = Math.round(headingBoundingBox.bottom - headingBoundingBox.top);
			var headingHeightPx     = headingHeight + "px";
			var contentHeight       = content.scrollHeight;
			var totalHeight         = contentHeight + headingHeight;
			
			heading.style.height    = headingHeightPx;
			el.style.top            = offset ? offset+"px" : "";
			
			/** Update ARIA states */
			if(aria){
				heading.setAttribute("aria-selected", open);
				heading.setAttribute("aria-expanded", open);
				content.setAttribute("aria-hidden",  !open);
			}
			
			/** Update tabindex */
			useKeyNav && content.setAttribute("tabindex", open? 0 : -1);
			
			/** If opened, set the fold's height to fit both heading *and* content. */
			if(open){
				el.style.height = totalHeight + "px";
				return el.scrollHeight;
			}

			/** Otherwise, just cut it off at the heading. */
			else{
				el.style.height = headingHeightPx;
				return headingHeight;
			}
		};
		

		/** Define the getter/setter functions for the fold's .open property */
		Object.defineProperty(this, "open", {
			get: function(){ return open },
			set: function(i){
				if((i = !!i) !== open){
					open = i;
					el.classList.toggle(openClass, i);
					if(onToggle) onToggle(THIS);
				}
			}
		})
		
		
		heading.addEventListener(touchEnabled ? "touchend" : "click", function(e){
			
			/** Prevent TouchEvents triggering a change if the user's still scrolling */
			if(e.type !== "touchend" || e.cancelable){
				THIS.open = !THIS.open;
				e.preventDefault();
			}
			
			return false;
		});
		
		
		/** Keystroke handlers */
		useKeyNav && heading.addEventListener("keydown", function(e){
			var fold, key;
			switch(key = e.keyCode){
				
				/** Enter */
				case 13:{
					THIS.open = !THIS.open;
					break;
				}
				
				/** Up/down arrows: Move between sections */
				case 38:
				case 40:{
					if(fold = (38 === key ? THIS.previousFold : THIS.nextFold)){
						fold.heading.focus();
						e.preventDefault();
						return false;
					}
					break;
				}
				
				/** Left arrow: Close section */
				case 37:{
					
					/** Section must be open first */
					if(open){
						el.classList.remove(openClass);
						THIS.open = false;
					}
					
					break;
				}
				
				/** Right arrow: Open section */
				case 39:{
					if(!open){
						el.classList.add(openClass);
						THIS.open = true;
					}
					break;
				}
				
				/** Escape */
				case 27:{
					this.blur();
					break;
				}
			}
		});
		
		
		/** Configure ARIA attributes */
		if(aria){
			
			/** Set the IDs of the heading/content elements if they're blank */
			if(!heading.id && !content.id){
				randomID   = uniqueID("a");
				heading.id = randomID + "-heading";
				content.id = randomID + "-content";
			}
			
			else if(!heading.id) heading.id = content.id + "-heading";
			else if(!content.id) content.id = heading.id + "-content";
			
			/** Set ARIA roles */
			heading.setAttribute("role", "tab");
			content.setAttribute("role", "tabpanel");
			heading.setAttribute("aria-controls",   content.id);
			content.setAttribute("aria-labelledby", heading.id);
		}
		
		/** Set heading's tabindex unless keyboard navigation's disabled */
		useKeyNav && heading.setAttribute("tabindex", 0);
		
		
		/** Expose some properties/methods for external use */
		this.update  = update;
		this.heading = heading;
		this.content = content;
	};



	/**
	 * Accordion class.
	 *
	 * @param {HTMLElement} el                   - Container holding each togglable fold of content.
	 * @param {Object}      options              - Auxiliary hash of options.
	 * @param {Boolean}     options.animHeight   - Animate container height during transition. Potentially jolty.
	 * @param {String}      options.animClass    - Name of CSS class determining animated height. Default: "anim-height"
	 * @param {Boolean}     options.autoResize   - Automatically resize folds when viewport dimensions change. Default: true
	 * @param {Boolean}     options.disableAria  - Disable the addition and management of ARIA attributes.
	 * @param {Boolean}     options.disableKeys  - Disable keyboard navigation
	 * @param {Function}    options.onToggle     - Callback triggered when a fold is toggled
	 */
	function Accordion(el, options){
		var folds       = [];
		var options     = options || {};
		var animClass   = options.animClass || "anim-height";

		/** If animHeight's not been explicitly passed, derive it from the presence/absence of el's .anim-height class */
		var animHeight  = options.animHeight;
		animHeight      = UNDEF === animHeight ? el.classList.contains(animClass) : animHeight;
		
		/** Check if autoResize hasn't been explicitly disabled (it's on by default) */
		var autoResize  = options.autoResize;
		autoResize      = UNDEF === autoResize ? true : autoResize;

		/** Internal use */
		var children    = el.children;
		var prevHeight  = 0;
		
		
		/** Clone a copy of the objects hash to pass to Fold instances */
		var foldOptions = (function(source, accordion){
			var result    = {};
			
			for(var i in source)
				result[i] = source[i];
			
			/** Callback triggered when folds are opened/closed */
			var onToggle    = source.onToggle;
			result.onToggle = onToggle ? function(fold){
				update();
				onToggle(fold, accordion);
			} : update;
		
			return result;
		}(options, this));



		/** Method to update the accordion's heights on resize */
		function update(){
			for(var totalHeight = 0, i = 0, l = folds.length; i < l; ++i)
				totalHeight += folds[i].update(totalHeight);

			/** If we're not animating heights, add a CSS class to keep items visible during transitions. */
			if(!animHeight && el.classList.toggle("shrinking", totalHeight < prevHeight)){
				console.info("Height difference: " + (prevHeight - totalHeight));
			}
			
			el.style.height = totalHeight + "px";
			prevHeight      = totalHeight;
			return totalHeight;
		}
		
		
		/**
		 * Store on each fold a link to its adjacent siblings.
		 *
		 * If the Accordion's contents have been modified, this function should be called
		 * to maintain correct tabbing order for keyboard navigation.
		 */
		function reindex(){
			for(var i = 0, l = folds.length; i < l; ++i){
				folds[i].previousFold = folds[i - 1] || null;
				folds[i].nextFold     = folds[i + 1] || null;
			}
		}


		/** Iterator variables */
		var i = 0;
		var l = children.length;
		
		/** Set the container's ARIA role */
		options.disableAria || el.setAttribute("role", "tablist");
		
		
		/** Loop through the accordion's immediate descendants and initialise a new fold for each one */
		for(; i < l; ++i) folds.push(new Fold(children[i], foldOptions));


		/** Update the accordion's heights if any images have loaded. */
		each.call(el.querySelectorAll("img"), function(img){
			img.addEventListener("load", update);
		});


		/** Configure any options passed in. */
		el.classList.toggle(animClass, animHeight);
		autoResize && window.addEventListener("resize", update);


		/** Expose some methods/properties for external use. */
		this.update  = update;
		this.reindex = reindex;
		this.folds   = folds;

		/** Get this happening. */
		reindex();
		update();
	};



	var IDs     = {};
	var indexes = {};
	
	
	/**
	 * Generate a unique ID for a DOM element.
	 *
	 * By default, minimalist IDs like "_1" or "_2" are generated using internally
	 * tracked incrementation. Uglier, more collision-proof IDs can be generated by
	 * passing a truthy value to the function's first argument.
	 *
	 * Irrespective of whether values are being generated simply or randomly, the
	 * document tree is always consulted first to ensure a duplicate ID is never
	 * returned.
	 *
	 * @param {String}  prefix - Prefix prepended to result. Default: "_"
	 * @param {Boolean} random - Generate collision-proof IDs using random symbols
	 * @param {Number}  length - Length of random passwords. Default: 6
	 * @return {String}
	 */
	function uniqueID(prefix, complex, length){
		length     = +(length || 6);
		var result =  (prefix = prefix || "_");
		
		/** Simple IDs */
		if(!complex){
			
			/** Set this prefix's starting index if it's not been used yet */
			if(!indexes[prefix])
				indexes[prefix] = 0;
			
			result += ++indexes[prefix];
		}
		
		/** Uglier/safer IDs */
		else{
			var chars   = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
			chars      += chars.toLowerCase();
			result     += chars[ Math.round(Math.random() * (chars.length - 1)) ];
			chars      += "0123456789";
			
			while(result.length < length)
				result += chars[ Math.round(Math.random() * (chars.length - 1))];
		}
		
		return IDs[result] || document.getElementById(result)
			? uniqueID(prefix, complex)
			: (IDs[result] = true, result);
	}


	/** If IE8PP exists, it means the author wants/needs IE8 support. See also: tinyurl.com/fixIE8-9 */
	if("function" === typeof IE8PP)
		Fold = IE8PP(Fold);


	/** Export */
	window.Accordion = Accordion;
}());