// tv.js: the plumbing every webOS TV app needs, as one global (window.TV). Classic script, no build step:
// packaged apps load from file://, where ES modules don't work.
//
//   TV.nav      layered D-pad focus (rows of items; overlays trap focus; Back pops them)
//   TV.input    one entry point for remote keys, the Magic Remote pointer and Bluetooth gamepads
//   TV.luna     promise wrapper for luna:// calls, plus app helpers (appInstalled, launchApp, exit)
//   TV.toast    in-app message; TV.systemToast for the TV's own bubble (shows over other apps)
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
	// Every luna:// method needs its ACG group in appinfo.json "requiredACG", or it fails only on the TV.
	TV.luna = function (service, method, params) {
		return new Promise(function (resolve, reject) {
			if (!TV.onWebOS) return reject(new Error("Not running on webOS"));
			webOS.service.request("luna://" + service, {
				method: method,
				parameters: params || {},
				onSuccess: resolve,
				onFailure: function (e) { reject(new Error(e.errorText || method + " failed")); }
			});
		});
	};
	TV.deviceInfo = function () {
		return new Promise(function (resolve) {
			if (!TV.onWebOS) return resolve(null);
			webOS.deviceInfo(resolve); // fields: modelName, version (firmware), sdkVersion, uhd, ...
		});
	};
	/** Third-party apps can't list installed apps, but can ask about one id. ACG: application.query */
	TV.appInstalled = function (id) {
		return TV.luna("com.webos.applicationManager", "getAppLoadStatus", { appId: id })
			.then(function (r) { return !!r.exist; }, function () { return false; });
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
			document.body.appendChild(toastEl);
		}
		toastEl.textContent = msg;
		toastEl.classList.add("show");
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, ms || 3200);
	};
	/**
	 * The TV's own notification bubble; it stays on screen even if the user switches apps. LG documents toasts
	 * as system-app only (expect store review to reject it), but Developer Mode apps are allowed on webOS 26.
	 * Only works while this app is running.
	 */
	TV.systemToast = function (msg) {
		return TV.luna("com.webos.notification", "createToast", { message: msg });
	};

	// ---------- Focus navigation ----------
	// A layer is a screen or overlay: { rows: [{ items: [el], track?, viewport?, idx? }], r?, onBack?, onClose?,
	// onRowFocus? }. Pushing an overlay traps focus in it; Back pops it. item._select runs on OK or click.
	// Optional track/viewport: the track slides horizontally inside the viewport to keep focus in view.
	var layers = [];
	var focusedEl = null;

	function top() { return layers[layers.length - 1]; }

	function applyFocus() {
		var layer = top();
		if (!layer) return;
		var row = layer.rows[layer.r];
		var item = row && row.items[row.idx];
		if (focusedEl) focusedEl.classList.remove("focused");
		focusedEl = item || null;
		if (!item) return;
		item.classList.add("focused");
		if (row.track && row.viewport) {
			var max = Math.max(0, row.track.scrollWidth - row.viewport.clientWidth);
			var x = Math.min(Math.max(0, item.offsetLeft - row.items[0].offsetLeft), max);
			row.track.style.transform = "translateX(" + -x + "px)";
		}
		if (layer.onRowFocus) layer.onRowFocus(layer.r);
	}

	function firstNonEmpty(layer) {
		if (layer.rows[layer.r] && layer.rows[layer.r].items.length) return;
		for (var i = 0; i < layer.rows.length; i++) if (layer.rows[i].items.length) { layer.r = i; return; }
	}

	// Magic Remote pointer: hovering focuses, clicking selects (only in the top layer)
	function bindPointer(layer) {
		layer.rows.forEach(function (row, r) {
			row.items.forEach(function (item, i) {
				if (item._tvBound) return;
				item._tvBound = true;
				item.addEventListener("mouseenter", function () {
					if (top() !== layer) return;
					layer.r = r; layer.rows[r].idx = i;
					applyFocus();
				});
				item.addEventListener("click", function () { if (top() === layer && item._select) item._select(); });
			});
		});
	}

	TV.nav = {
		push: function (layer) {
			layer.r = layer.r || 0;
			layer.rows.forEach(function (row) { row.idx = row.idx || 0; });
			layers.push(layer);
			bindPointer(layer);
			firstNonEmpty(layer);
			applyFocus();
		},
		pop: function () {
			var layer = layers.pop();
			if (focusedEl) focusedEl.classList.remove("focused");
			focusedEl = null;
			if (layer && layer.onClose) layer.onClose();
			applyFocus();
		},
		/** Swap a layer's rows (e.g. when data arrives), keeping the focus position where possible. */
		update: function (layer, rows) {
			rows.forEach(function (row, i) {
				var prev = layer.rows[i];
				row.idx = prev ? Math.min(prev.idx, Math.max(0, row.items.length - 1)) : 0;
			});
			layer.rows = rows;
			bindPointer(layer);
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
		select: function () { if (focusedEl && focusedEl._select) focusedEl._select(); },
		back: function () {
			var layer = top();
			if (layers.length > 1) TV.nav.pop();
			else if (layer && layer.onBack) layer.onBack();
			else TV.exit();
		},
		focused: function () { return focusedEl; },
		depth: function () { return layers.length; }
	};

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
	 */
	TV.onInput = null;

	/** Every input source ends up here. Call it yourself to simulate input. */
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
	// 27/8 (Esc/Backspace) make Back work with a keyboard in a desktop browser.
	TV.KEYS = {
		37: "left", 38: "up", 39: "right", 40: "down", 13: "ok", 461: "back", 27: "back", 8: "back",
		403: "red", 404: "green", 405: "yellow", 406: "blue",
		415: "play", 19: "pause", 463: "playpause", 413: "stop", 412: "rewind", 417: "forward"
	};
	for (var d = 0; d <= 9; d++) TV.KEYS[48 + d] = "digit" + d;

	document.addEventListener("keydown", function (e) {
		var action = TV.KEYS[e.keyCode];
		if (!action) return activity();
		if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && action.indexOf("digit") === 0) return;
		e.preventDefault();
		TV.input(action);
	});
	document.addEventListener("mousemove", activity);

	// ---------- Gamepad (Bluetooth controllers paired to the TV, e.g. DualSense, Xbox) ----------
	// Standard mapping: 0 Cross/A = ok, 1 Circle/B = back, 12–15 D-pad. The left stick navigates too, with
	// key-repeat. Polling runs only while a pad is connected.
	var BUTTONS = { 0: "ok", 1: "back", 12: "up", 13: "down", 14: "left", 15: "right" };
	var held = {};
	var polling = false;
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
				if (!h) { held[key] = { next: now + 380 }; TV.input(a); }
				else if (repeats && now >= h.next) { h.next = now + 120; TV.input(a); }
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
