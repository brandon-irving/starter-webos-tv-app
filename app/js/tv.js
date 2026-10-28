// tv.js: the plumbing every webOS TV app needs, as one global (window.TV). Classic script, no build step:
// packaged apps load from file://, where ES modules don't work. Written for Chromium 87+ (webOS TV 22+).
//
//   TV.nav      layered D-pad focus (rows of items; overlays trap focus; Back pops them; text fields edit in place)
//   TV.input    one entry point for remote keys, the Magic Remote pointer and Bluetooth gamepads
//   TV.luna     promise wrapper for luna:// calls, plus app helpers (appInstalled, launchApp, exit)
//   TV.toast    in-app message
//   TV.idle     run something after N ms without input (screensavers, auto-hide)
(function () {
	"use strict";
	var TV = (window.TV = {});

	TV.$ = function (sel, root) { return (root || document).querySelector(sel); };
	TV.el = function (tag, cls, text) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text != null) e.textContent = text;
		return e;
	};
	/** True on a TV or the Simulator; false in a desktop browser (so pages still render there). */
	TV.onWebOS = !!(window.webOS && window.PalmSystem);

	// ---------- Platform (Luna services) ----------
	// Every luna:// method needs its ACG group in appinfo.json "requiredACG". webOS TV 26 can enforce it and
	// webOS TV 27 requires it; on 25 and older the field is ignored.
	/** Rejects with an Error carrying the service's errorCode, errorText and full response. */
	TV.luna = function (service, method, params) {
		return new Promise(function (resolve, reject) {
			if (!TV.onWebOS) return reject(new Error("Not running on webOS"));
			webOS.service.request("luna://" + service, {
				method: method,
				parameters: params || {},
				onSuccess: resolve,
				onFailure: function (res) {
					res = res || {};
					var err = new Error(service + "/" + method + " failed: " + (res.errorText || "no error text") +
						(res.errorCode != null ? " (code " + res.errorCode + ")" : ""));
					err.errorCode = res.errorCode;
					err.errorText = res.errorText;
					err.response = res;
					reject(err);
				}
			});
		});
	};
	TV.deviceInfo = function () {
		return new Promise(function (resolve) {
			if (!TV.onWebOS) return resolve(null);
			webOS.deviceInfo(resolve); // fields: modelName, version (firmware), sdkVersion, uhd, ...
		});
	};
	/**
	 * Third-party apps can't list installed apps, but can ask about one id. ACG: application.query.
	 * Resolves true/false; rejects when the request itself fails (missing ACG, not on webOS), so "not installed"
	 * and "couldn't check" stay distinguishable.
	 */
	TV.appInstalled = function (id) {
		return TV.luna("com.webos.applicationManager", "getAppLoadStatus", { appId: id })
			.then(function (r) { return !!r.exist; });
	};
	/** ACG: application.launcher. Ids: "youtube.leanback.v4", "netflix", "com.webos.app.hdmi1", ... */
	TV.launchApp = function (id, params) {
		return TV.luna("com.webos.applicationManager", "launch", { id: id, params: params || {} });
	};
	/** Hand control back to the TV (what Back should do on your top-level screen). */
	TV.exit = function () { if (TV.onWebOS && webOS.platformBack) webOS.platformBack(); };

	// ---------- Toasts ----------
	var toastEl, toastTimer;
	TV.toast = function (msg, ms) {
		if (!toastEl) {
			var css = document.createElement("style");
			css.textContent =
				".tv-toast{position:fixed;left:50%;bottom:72px;transform:translate(-50%,24px);opacity:0;z-index:9999;" +
				"padding:18px 32px;border-radius:14px;background:rgba(20,22,26,.94);color:#fff;font-size:28px;" +
				"box-shadow:0 8px 32px rgba(0,0,0,.5);transition:opacity .2s,transform .2s;pointer-events:none}" +
				".tv-toast.show{opacity:1;transform:translate(-50%,0)}";
			document.head.appendChild(css);
			toastEl = TV.el("div", "tv-toast");
			toastEl.setAttribute("role", "status");
			document.body.appendChild(toastEl);
		}
		toastEl.textContent = msg;
		toastEl.classList.add("show");
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, ms || 3200);
	};

	// ---------- Text editing ----------
	// A text field (input, textarea or contenteditable) is a normal focus item until it's selected. Selecting it
	// (OK, or clicking it) gives it browser focus, which opens the TV keyboard, and from then on keys belong to the
	// field: Backspace deletes, arrows move the caret. Back, or Enter in a one-line input, leaves the field and
	// D-pad navigation resumes on the same item. "Editing" is read from document.activeElement every time rather
	// than tracked, so it can't drift when the TV keyboard closes itself or a script focuses a field.
	var TEXT_INPUT = /^(text|search|email|url|tel|password|number)$/i;
	function isEditable(el) {
		if (!el || el.nodeType !== 1 || el.disabled || el.readOnly) return false;
		if (el.isContentEditable) return true;
		if (el.tagName === "TEXTAREA") return true;
		return el.tagName === "INPUT" && TEXT_INPUT.test(el.type || "text");
	}
	/** The editable element a focus item stands for: the item itself, or the first editable inside it. */
	function editableIn(item) {
		if (!item) return null;
		if (isEditable(item)) return item;
		var found = item.querySelectorAll("input, textarea, [contenteditable]");
		for (var i = 0; i < found.length; i++) if (isEditable(found[i])) return found[i];
		return null;
	}
	function editing() {
		var a = document.activeElement;
		return a && a !== document.body && isEditable(a) ? a : null;
	}
	function stopEditing() {
		var el = editing();
		if (el) el.blur();
		applyFocus();
	}

	// ---------- Focus navigation ----------
	// A layer is a screen or overlay: { rows: [{ items: [el], track?, viewport?, idx? }], r?, onBack?, onClose?,
	// onRowFocus? }. Pushing an overlay traps focus in it; Back pops it. item._select runs on OK or click; an item
	// without _select that is (or contains) a text field starts editing it.
	// Optional track/viewport: the track slides horizontally inside the viewport to keep focus in view.
	// The focused item gets the "focused" class and, unless it's a text field, browser focus too (so assistive
	// tech follows along); an item being typed into also gets "editing".
	var layers = [];
	var focusedEl = null;

	function top() { return layers[layers.length - 1]; }

	function applyFocus() {
		var layer = top();
		if (!layer) return;
		var row = layer.rows[layer.r];
		var item = row && row.items[row.idx];
		if (focusedEl && focusedEl !== item) focusedEl.classList.remove("focused");
		focusedEl = item || null;
		if (!item) return;
		item.classList.add("focused");
		syncDomFocus(item);
		if (row.track && row.viewport) {
			var max = Math.max(0, row.track.scrollWidth - row.viewport.clientWidth);
			var x = Math.min(Math.max(0, item.offsetLeft - row.items[0].offsetLeft), max);
			row.track.style.transform = "translateX(" + -x + "px)";
		}
		if (layer.onRowFocus) layer.onRowFocus(layer.r);
	}

	function syncDomFocus(item) {
		var ed = editing();
		if (ed && item.contains(ed)) return; // typing in this item: leave the field focused
		if (isEditable(item)) {
			// Don't give a text field browser focus just for being navigated to: that would open the keyboard
			if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
			return;
		}
		if (document.activeElement !== item) item.focus({ preventScroll: true });
	}

	/** Make items focusable by script (tabindex -1) without changing natively focusable ones. */
	function prepare(layer) {
		layer.rows.forEach(function (row) {
			row.items.forEach(function (item) {
				if (item.tabIndex < 0 && !item.hasAttribute("tabindex") && !isEditable(item)) item.setAttribute("tabindex", "-1");
			});
		});
	}

	function firstNonEmpty(layer) {
		if (layer.rows[layer.r] && layer.rows[layer.r].items.length) return;
		for (var i = 0; i < layer.rows.length; i++) if (layer.rows[i].items.length) { layer.r = i; return; }
	}

	/** Where target is in the top layer right now, or null. Looked up on every event, never cached. */
	function locate(target) {
		var layer = top();
		if (!layer || !target || target.nodeType !== 1) return null;
		for (var r = 0; r < layer.rows.length; r++) {
			var items = layer.rows[r].items;
			for (var i = 0; i < items.length; i++) {
				if (items[i] === target || items[i].contains(target)) return { r: r, i: i, item: items[i] };
			}
		}
		return null;
	}

	function focusAt(at) {
		if (at.item === focusedEl) return;
		var layer = top();
		layer.r = at.r;
		layer.rows[at.r].idx = at.i;
		applyFocus();
	}

	TV.nav = {
		push: function (layer) {
			layer.r = layer.r || 0;
			layer.rows.forEach(function (row) { row.idx = row.idx || 0; });
			if (editing()) editing().blur();
			layers.push(layer);
			prepare(layer);
			firstNonEmpty(layer);
			applyFocus();
		},
		pop: function () {
			var layer = layers.pop();
			if (editing()) editing().blur();
			if (focusedEl) focusedEl.classList.remove("focused");
			focusedEl = null;
			if (layer && layer.onClose) layer.onClose();
			applyFocus();
		},
		/**
		 * Swap a layer's rows (e.g. when data arrives or a filter changes). Focus follows the focused element if
		 * it's still there (reordered rows); otherwise it stays at the same position, clamped to the new length.
		 */
		update: function (layer, rows) {
			var cur = layer.rows[layer.r];
			var keep = cur && cur.items[cur.idx];
			rows.forEach(function (row, i) {
				var prev = layer.rows[i];
				row.idx = prev ? Math.min(prev.idx || 0, Math.max(0, row.items.length - 1)) : 0;
			});
			layer.rows = rows;
			for (var r = 0; r < rows.length; r++) {
				var i = keep ? rows[r].items.indexOf(keep) : -1;
				if (i >= 0) { layer.r = r; rows[r].idx = i; break; }
			}
			prepare(layer);
			firstNonEmpty(layer);
			if (layer === top()) applyFocus();
		},
		move: function (dr, dc) {
			var layer = top();
			if (!layer) return;
			if (dc) {
				var row = layer.rows[layer.r];
				if (!row) return;
				row.idx = Math.max(0, Math.min(row.items.length - 1, row.idx + dc));
			}
			if (dr) {
				// Skip empty rows
				for (var r = layer.r + dr; r >= 0 && r < layer.rows.length; r += dr) {
					if (layer.rows[r].items.length) { layer.r = r; break; }
				}
			}
			applyFocus();
		},
		select: function () {
			var el = focusedEl;
			if (!el) return;
			if (el._select) return el._select();
			var field = editableIn(el);
			if (field && editing() !== field) field.focus(); // guard: selecting a field that's already focused does nothing
		},
		back: function () {
			var layer = top();
			if (layers.length > 1) TV.nav.pop();
			else if (layer && layer.onBack) layer.onBack();
			else TV.exit();
		},
		focused: function () { return focusedEl; },
		depth: function () { return layers.length; },
		/** The text field being typed into, or null. */
		editing: editing,
		/** Leave the text field (like pressing Back in it) and resume D-pad navigation. */
		stopEditing: stopEditing
	};

	// When a field gets browser focus by any route (select, pointer tap, script), point nav focus at its item and
	// mark it; when it loses focus (Back, the TV keyboard closing, a click elsewhere), unmark it.
	document.addEventListener("focusin", function (e) {
		if (!isEditable(e.target)) return;
		var at = locate(e.target);
		if (!at) return;
		focusAt(at);
		at.item.classList.add("editing");
	});
	document.addEventListener("focusout", function (e) {
		if (!isEditable(e.target)) return;
		var at = locate(e.target);
		if (at) at.item.classList.remove("editing");
	});

	// ---------- Idle ----------
	var idleMs = 0, idleFn = null, idleTimer;
	/** Call fn after ms without any input. TV.idle(0) turns it off. */
	TV.idle = function (ms, fn) {
		idleMs = ms; idleFn = fn;
		activity();
	};
	function activity() {
		clearTimeout(idleTimer);
		if (idleMs && idleFn) idleTimer = setTimeout(idleFn, idleMs);
	}

	// ---------- Input ----------
	/**
	 * Optional hook that sees every action first; return true to consume it. Actions: up down left right ok back,
	 * plus red green yellow blue play pause playpause stop rewind forward (remote keys) and digit0–digit9.
	 * Keys typed into a text field don't come through here; they go to the field.
	 */
	TV.onInput = null;

	/** Every input source ends up here (remote, pointer clicks, gamepad). Call it yourself to simulate input. */
	TV.input = function (action) {
		activity();
		if (TV.onInput && TV.onInput(action)) return;
		if (action === "up") TV.nav.move(-1, 0);
		else if (action === "down") TV.nav.move(1, 0);
		else if (action === "left") TV.nav.move(0, -1);
		else if (action === "right") TV.nav.move(0, 1);
		else if (action === "ok") TV.nav.select();
		else if (action === "back") TV.nav.back();
	};

	// Remote keyCodes. Back (461) reaches the page only with "disableBackHistoryAPI": true in appinfo.json.
	// 27/8 (Esc/Backspace) make Back work with a keyboard in a desktop browser (never while typing in a field).
	TV.KEYS = {
		37: "left", 38: "up", 39: "right", 40: "down", 13: "ok", 461: "back", 27: "back", 8: "back",
		403: "red", 404: "green", 405: "yellow", 406: "blue",
		415: "play", 19: "pause", 463: "playpause", 413: "stop", 412: "rewind", 417: "forward"
	};
	for (var d = 0; d <= 9; d++) TV.KEYS[48 + d] = "digit" + d;

	document.addEventListener("keydown", function (e) {
		activity();
		var field = editing();
		if (field) {
			// Keys belong to the field. Back, or Enter in a one-line input, ends editing ("change" fires on blur).
			if (e.keyCode === 461 || e.keyCode === 27 || (e.keyCode === 13 && field.tagName === "INPUT")) {
				e.preventDefault();
				stopEditing();
			}
			return;
		}
		var action = TV.KEYS[e.keyCode];
		if (!action) return;
		e.preventDefault(); // also stops Enter on a focused <button> from firing a second, native click
		TV.input(action);
	});

	// Magic Remote pointer: one delegated listener each, resolved against the current top layer on every event,
	// so reopened overlays, reordered rows and moved elements need no rebinding.
	document.addEventListener("mouseover", function (e) {
		if (editing()) return; // hovering past other items mustn't close the keyboard mid-typing
		var at = locate(e.target);
		if (at) focusAt(at); // no-op while moving between children of the focused item
	});
	document.addEventListener("click", function (e) {
		if (e.detail === 0) return; // keyboard-generated click (Enter/Space on a <button>): keydown handled it
		var field = editing();
		if (field && field.contains(e.target)) return; // placing the caret in the field being edited
		var at = locate(e.target);
		if (!at) return;
		focusAt(at);
		TV.input("ok");
	});
	document.addEventListener("mousemove", activity);

	// ---------- Gamepad (Bluetooth controllers paired to the TV, e.g. DualSense, Xbox) ----------
	// Standard mapping: 0 Cross/A = ok, 1 Circle/B = back, 12–15 D-pad. The left stick navigates too, with
	// key-repeat. Polling runs only while a pad is connected. While a text field is focused, Circle/B leaves it
	// and the rest is ignored (type with the TV keyboard).
	var BUTTONS = { 0: "ok", 1: "back", 12: "up", 13: "down", 14: "left", 15: "right" };
	var held = {};
	var polling = false;
	function padAction(a) {
		if (!editing()) return TV.input(a);
		activity();
		if (a === "back") stopEditing();
	}
	function pollPads() {
		var pads = navigator.getGamepads ? navigator.getGamepads() : [];
		var any = false;
		var now = Date.now();
		for (var p = 0; p < pads.length; p++) {
			var pad = pads[p];
			if (!pad) continue;
			any = true;
			var on = {};
			for (var b in BUTTONS) if (pad.buttons[b] && pad.buttons[b].pressed) on[BUTTONS[b]] = true;
			var ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
			if (ax < -0.6) on.left = true;
			if (ax > 0.6) on.right = true;
			if (ay < -0.6) on.up = true;
			if (ay > 0.6) on.down = true;
			["up", "down", "left", "right", "ok", "back"].forEach(function (a) {
				var key = p + a;
				if (!on[a]) { delete held[key]; return; }
				var h = held[key];
				var repeats = a !== "ok" && a !== "back";
				if (!h) { held[key] = { next: now + 380 }; padAction(a); }
				else if (repeats && now >= h.next) { h.next = now + 120; padAction(a); }
			});
		}
		if (any) requestAnimationFrame(pollPads);
		else polling = false;
	}
	/** Called with the Gamepad when one connects; default shows a toast. */
	TV.onGamepad = function (pad) { TV.toast("Controller connected: " + (pad.id.split("(")[0].trim() || "gamepad")); };
	window.addEventListener("gamepadconnected", function (e) {
		if (TV.onGamepad) TV.onGamepad(e.gamepad);
		if (!polling) { polling = true; requestAnimationFrame(pollPads); }
	});
})();
