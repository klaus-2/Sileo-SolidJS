import type { JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For } from "solid-js";
import {
	AUTO_COLLAPSE_DELAY,
	AUTO_EXPAND_DELAY,
	DEFAULT_TOAST_DURATION,
	EXIT_DURATION,
} from "./constants";
import { Sileo } from "./sileo";
import type { SileoOptions, SileoPosition, SileoState } from "./types";

const pillAlign = (pos: SileoPosition) =>
	pos.includes("right") ? "right" : pos.includes("center") ? "center" : "left";
const expandDir = (pos: SileoPosition) =>
	pos.startsWith("top") ? ("bottom" as const) : ("top" as const);

/* ---------------------------------- Types --------------------------------- */

interface InternalSileoOptions extends SileoOptions {
	id?: string;
	state?: SileoState;
}

interface SileoItem extends InternalSileoOptions {
	id: string;
	instanceId: string;
	exiting?: boolean;
	autoExpandDelayMs?: number;
	autoCollapseDelayMs?: number;
}

type SileoOffsetValue = number | string;
type SileoOffsetConfig = Partial<
	Record<"top" | "right" | "bottom" | "left", SileoOffsetValue>
>;

export interface SileoToasterProps {
	children?: JSX.Element;
	position?: SileoPosition;
	offset?: SileoOffsetValue | SileoOffsetConfig;
	options?: Partial<SileoOptions>;
	theme?: "light" | "dark" | "system";
}

/* ------------------------------ Global State ------------------------------ */

type SileoListener = (toasts: SileoItem[]) => void;

const store = {
	toasts: [] as SileoItem[],
	listeners: new Set<SileoListener>(),
	position: "top-right" as SileoPosition,
	options: undefined as Partial<SileoOptions> | undefined,

	emit() {
		for (const fn of this.listeners) fn(this.toasts);
	},

	update(fn: (prev: SileoItem[]) => SileoItem[]) {
		this.toasts = fn(this.toasts);
		this.emit();
	},
};

let idCounter = 0;
const generateId = () =>
	`${++idCounter}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const timeoutKey = (t: SileoItem) => `${t.id}:${t.instanceId}`;

/* ------------------------------- Toast API -------------------------------- */

const dismissToast = (id: string) => {
	const item = store.toasts.find((t) => t.id === id);
	if (!item || item.exiting) return;

	store.update((prev) =>
		prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
	);

	setTimeout(
		() => store.update((prev) => prev.filter((t) => t.id !== id)),
		EXIT_DURATION,
	);
};

const resolveAutopilot = (
	opts: InternalSileoOptions,
	duration: number | null,
): { expandDelayMs?: number; collapseDelayMs?: number } => {
	if (opts.autopilot === false || !duration || duration <= 0) return {};
	const cfg = typeof opts.autopilot === "object" ? opts.autopilot : undefined;
	const clamp = (v: number) => Math.min(duration, Math.max(0, v));
	return {
		expandDelayMs: clamp(cfg?.expand ?? AUTO_EXPAND_DELAY),
		collapseDelayMs: clamp(cfg?.collapse ?? AUTO_COLLAPSE_DELAY),
	};
};

const mergeOptions = (options: InternalSileoOptions) => ({
	...store.options,
	...options,
	styles: { ...store.options?.styles, ...options.styles },
});

const buildSileoItem = (
	merged: InternalSileoOptions,
	id: string,
	fallbackPosition?: SileoPosition,
): SileoItem => {
	const duration = merged.duration ?? DEFAULT_TOAST_DURATION;
	const auto = resolveAutopilot(merged, duration);
	return {
		...merged,
		id,
		instanceId: generateId(),
		position: merged.position ?? fallbackPosition ?? store.position,
		autoExpandDelayMs: auto.expandDelayMs,
		autoCollapseDelayMs: auto.collapseDelayMs,
	};
};

const createToast = (options: InternalSileoOptions) => {
	const live = store.toasts.filter((t) => !t.exiting);
	const merged = mergeOptions(options);

	const id = merged.id ?? "sileo-default";
	const prev = live.find((t) => t.id === id);
	const item = buildSileoItem(merged, id, prev?.position);

	if (prev) {
		store.update((p) => p.map((t) => (t.id === id ? item : t)));
	} else {
		store.update((p) => [...p.filter((t) => t.id !== id), item]);
	}
	return { id, duration: merged.duration ?? DEFAULT_TOAST_DURATION };
};

const updateToast = (id: string, options: InternalSileoOptions) => {
	const existing = store.toasts.find((t) => t.id === id);
	if (!existing) return;

	const item = buildSileoItem(mergeOptions(options), id, existing.position);
	store.update((prev) => prev.map((t) => (t.id === id ? item : t)));
};

export interface SileoPromiseOptions<T = unknown> {
	loading: SileoOptions;
	success: SileoOptions | ((data: T) => SileoOptions);
	error: SileoOptions | ((err: unknown) => SileoOptions);
	action?: SileoOptions | ((data: T) => SileoOptions);
	position?: SileoPosition;
}

export const sileo = {
	show: (opts: SileoOptions) => createToast({ ...opts, state: opts.type }).id,
	success: (opts: SileoOptions) =>
		createToast({ ...opts, state: "success" }).id,
	error: (opts: SileoOptions) => createToast({ ...opts, state: "error" }).id,
	warning: (opts: SileoOptions) =>
		createToast({ ...opts, state: "warning" }).id,
	info: (opts: SileoOptions) => createToast({ ...opts, state: "info" }).id,
	action: (opts: SileoOptions) => createToast({ ...opts, state: "action" }).id,

	promise: <T,>(
		promise: Promise<T> | (() => Promise<T>),
		opts: SileoPromiseOptions<T>,
	): Promise<T> => {
		const { id } = createToast({
			...opts.loading,
			state: "loading",
			duration: null,
			position: opts.position,
		});

		const p = typeof promise === "function" ? promise() : promise;

		p.then((data) => {
			if (opts.action) {
				const actionOpts =
					typeof opts.action === "function" ? opts.action(data) : opts.action;
				updateToast(id, { ...actionOpts, state: "action", id });
			} else {
				const successOpts =
					typeof opts.success === "function"
						? opts.success(data)
						: opts.success;
				updateToast(id, { ...successOpts, state: "success", id });
			}
		}).catch((err) => {
			const errorOpts =
				typeof opts.error === "function" ? opts.error(err) : opts.error;
			updateToast(id, { ...errorOpts, state: "error", id });
		});

		return p;
	},

	dismiss: dismissToast,

	clear: (position?: SileoPosition) =>
		store.update((prev) =>
			position ? prev.filter((t) => t.position !== position) : [],
		),
};

/* ------------------------------ Toaster Component ------------------------- */

const THEME_FILLS = {
	light: "#1a1a1a",
	dark: "#f2f2f2",
} as const;

function useResolvedTheme(
	theme: "light" | "dark" | "system" | undefined,
): () => "light" | "dark" {
	const getInitialTheme = (): "light" | "dark" => {
		if (theme === "light" || theme === "dark") return theme;
		if (typeof window === "undefined") return "light";
		return window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light";
	};
	const [resolved, setResolved] = createSignal<"light" | "dark">(getInitialTheme());

	createEffect(() => {
		const t = theme;
		if (t === "light" || t === "dark") {
			setResolved(t);
			return;
		}
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = (e: MediaQueryListEvent) =>
			setResolved(e.matches ? "dark" : "light");
		setResolved(mq.matches ? "dark" : "light");
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	});

	return resolved;
}

export function Toaster(props: SileoToasterProps) {
	const resolvedTheme = useResolvedTheme(props.theme);
	const [toasts, setToasts] = createSignal<SileoItem[]>(store.toasts);
	const [activeId, setActiveId] = createSignal<string>();

	const hoverRef = { current: false };
	const timersRef = { current: new Map<string, number>() };
	const listRef = { current: store.toasts };
	const latestRef = { current: undefined as string | undefined };
	const handlersCache = {
		current: new Map<
			string,
			{
				enter: (e: MouseEvent) => void;
				leave: (e: MouseEvent) => void;
				dismiss: () => void;
			}
		>(),
	};

	createEffect(() => {
		store.position = props.position ?? "top-right";
		store.options = props.options;
	});

	const clearAllTimers = () => {
		for (const t of timersRef.current.values()) clearTimeout(t);
		timersRef.current.clear();
	};

	const schedule = (items: SileoItem[]) => {
		if (hoverRef.current) return;

		for (const item of items) {
			if (item.exiting) continue;
			const key = timeoutKey(item);
			if (timersRef.current.has(key)) continue;

			if (item.duration === null) continue;
			const dur = item.duration ?? DEFAULT_TOAST_DURATION;
			if (dur <= 0) continue;

			timersRef.current.set(
				key,
				window.setTimeout(() => dismissToast(item.id), dur),
			);
		}
	};

	createEffect(() => {
		const listener: SileoListener = (next) => setToasts(next);
		store.listeners.add(listener);
		return () => {
			store.listeners.delete(listener);
			clearAllTimers();
		};
	});

	createEffect(() => {
		const items = toasts();
		listRef.current = items;

		const toastKeys = new Set(items.map(timeoutKey));
		const toastIds = new Set(items.map((t) => t.id));
		for (const [key, timer] of timersRef.current) {
			if (!toastKeys.has(key)) {
				clearTimeout(timer);
				timersRef.current.delete(key);
			}
		}
		for (const id of handlersCache.current.keys()) {
			if (!toastIds.has(id)) handlersCache.current.delete(id);
		}

		schedule(items);
	});

	const handleMouseEnterRef = { current: null as ((e: MouseEvent) => void) | null };
	const handleMouseLeaveRef = { current: null as ((e: MouseEvent) => void) | null };

	handleMouseEnterRef.current = () => {
		if (hoverRef.current) return;
		hoverRef.current = true;
		clearAllTimers();
	};

	handleMouseLeaveRef.current = () => {
		if (!hoverRef.current) return;
		hoverRef.current = false;
		schedule(listRef.current);
	};

	const latest = createMemo(() => {
		const items = toasts();
		for (let i = items.length - 1; i >= 0; i--) {
			if (!items[i].exiting) return items[i].id;
		}
		return undefined;
	});

	createEffect(() => {
		latestRef.current = latest();
		setActiveId(latest());
	});

	const getHandlers = (toastId: string) => {
		let cached = handlersCache.current.get(toastId);
		if (cached) return cached;

		cached = {
			enter: ((e: MouseEvent) => {
				setActiveId((prev) => (prev === toastId ? prev : toastId));
				handleMouseEnterRef.current?.(e);
			}),
			leave: ((e: MouseEvent) => {
				setActiveId((prev) =>
					prev === latestRef.current ? prev : latestRef.current,
				);
				handleMouseLeaveRef.current?.(e);
			}),
			dismiss: () => dismissToast(toastId),
		};

		handlersCache.current.set(toastId, cached);
		return cached;
	};

	const getViewportStyle = (pos: SileoPosition): JSX.CSSProperties | undefined => {
		if (props.offset === undefined) return undefined;

		const o =
			typeof props.offset === "object"
				? props.offset
				: { top: props.offset, right: props.offset, bottom: props.offset, left: props.offset };

		const s: JSX.CSSProperties = {};
		const px = (v: SileoOffsetValue) =>
			typeof v === "number" ? `${v}px` : v;

		if (pos.startsWith("top") && o.top) s.top = px(o.top);
		if (pos.startsWith("bottom") && o.bottom) s.bottom = px(o.bottom);
		if (pos.endsWith("left") && o.left) s.left = px(o.left);
		if (pos.endsWith("right") && o.right) s.right = px(o.right);

		return s;
	};

	const activePositionsList = createMemo(() => {
		const map = new Map<SileoPosition, SileoItem[]>();
		const items = toasts();
		const pos = props.position ?? "top-right";
		for (const t of items) {
			const tPos = t.position ?? pos;
			const arr = map.get(tPos);
			if (arr) {
				arr.push(t);
			} else {
				map.set(tPos, [t]);
			}
		}
		return Array.from(map, ([p, its]) => ({ pos: p, items: its }));
	});

	return (
		<>
			{props.children}
			<For each={activePositionsList()}>
				{({ pos, items }) => {
					const pill = pillAlign(pos);
					const expand = expandDir(pos);

					return (
						<section
							data-sileo-viewport
							data-position={pos}
							data-theme={props.theme ? resolvedTheme() : undefined}
							aria-live="polite"
							style={getViewportStyle(pos)}
						>
							<For each={items}>
								{(item) => {
									const h = getHandlers(item.id);
									return (
										<Sileo
											id={item.id}
											state={item.state}
											title={item.title}
											description={item.description}
											position={pill}
											expand={expand}
											icon={item.icon}
											fill={item.fill ?? (props.theme ? THEME_FILLS[resolvedTheme()] : undefined)}
											styles={item.styles}
											button={item.button}
											roundness={item.roundness}
											exiting={item.exiting}
											autoExpandDelayMs={item.autoExpandDelayMs}
											autoCollapseDelayMs={item.autoCollapseDelayMs}
											refreshKey={item.instanceId}
											canExpand={activeId() === undefined || activeId() === item.id}
											onMouseEnter={h.enter}
											onMouseLeave={h.leave}
											onDismiss={h.dismiss}
										/>
									);
								}}
							</For>
						</section>
					);
				}}
			</For>
		</>
	);
}
