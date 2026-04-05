import { animate } from "motion";
import type { JSX } from "solid-js";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import {
	BLUR_RATIO,
	DEFAULT_ROUNDNESS,
	HEADER_EXIT_MS,
	HEIGHT,
	MIN_EXPAND_RATIO,
	PILL_PADDING,
	SWAP_COLLAPSE_MS,
	WIDTH,
} from "./constants";
import {
	ArrowRight,
	Check,
	CircleAlert,
	LifeBuoy,
	LoaderCircle,
	X,
} from "./icons";
import "./styles.css";
import type { SileoButton, SileoState, SileoStyles } from "./types";

type State = SileoState;

interface View {
	title?: string;
	description?: JSX.Element | string;
	state: State;
	icon?: JSX.Element | null;
	styles?: SileoStyles;
	button?: SileoButton;
	fill: string;
}

interface SileoProps {
	id: string;
	fill?: string;
	state?: State;
	title?: string;
	description?: JSX.Element | string;
	position?: "left" | "center" | "right";
	expand?: "top" | "bottom";
	class?: string;
	icon?: JSX.Element | null;
	styles?: SileoStyles;
	button?: SileoButton;
	roundness?: number;
	exiting?: boolean;
	autoExpandDelayMs?: number;
	autoCollapseDelayMs?: number;
	canExpand?: boolean;
	interruptKey?: string;
	refreshKey?: string;
	onMouseEnter?: (e: MouseEvent) => void;
	onMouseLeave?: (e: MouseEvent) => void;
	onDismiss?: () => void;
}

const STATE_ICON: Record<State, JSX.Element> = {
	success: <Check />,
	loading: <LoaderCircle data-sileo-icon="spin" aria-hidden="true" />,
	error: <X />,
	warning: <CircleAlert />,
	info: <LifeBuoy />,
	action: <ArrowRight />,
};

function GooeyDefs(props: { filterId: string; blur: number }) {
	return (
		<defs>
			<filter
				id={props.filterId}
				x="-20%"
				y="-20%"
				width="140%"
				height="140%"
				color-interpolation-filters="sRGB"
			>
				<feGaussianBlur in="SourceGraphic" stdDeviation={props.blur} result="blur" />
				<feColorMatrix
					in="blur"
					type="matrix"
					values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
					result="goo"
				/>
				<feComposite in="SourceGraphic" in2="goo" operator="atop" />
			</filter>
		</defs>
	);
}

const ANIM_DURATION = 0.6;
const SPRING_CONFIG = { duration: ANIM_DURATION, easing: [0.25, 0.1, 0.25, 1] as [number, number, number, number] };
const SPRING_NO_BOUNCE = { duration: ANIM_DURATION, easing: [0.25, 0.1, 0.25, 1] as [number, number, number, number] };
const INSTANT = { duration: 0 };

export function Sileo(props: SileoProps) {
	const state = () => props.state ?? "success";
	const fill = () => props.fill ?? "#FFFFFF";

	const next = createMemo(
		() => ({
			title: props.title,
			description: props.description,
			state: state(),
			icon: props.icon,
			styles: props.styles,
			button: props.button,
			fill: fill(),
		}),
	);

	const [view, setView] = createSignal<View>(next());
	const [applied, setApplied] = createSignal<string | undefined>(props.refreshKey);
	const [isExpanded, setIsExpanded] = createSignal(false);
	const [ready, setReady] = createSignal(false);
	const [pillWidth, setPillWidth] = createSignal(0);
	const [contentHeight, setContentHeight] = createSignal(0);

	const hasDesc = createMemo(() => Boolean(view().description) || Boolean(view().button));
	const isLoading = createMemo(() => view().state === "loading");
	const open = createMemo(() => hasDesc() && isExpanded() && !isLoading());
	const allowExpand = createMemo(() =>
		isLoading()
			? false
			: (props.canExpand ?? (!props.interruptKey || props.interruptKey === props.id))
	);

	const headerKey = createMemo(() => `${view().state}-${view().title}`);
	const filterId = `sileo-gooey-${props.id}`;
	const resolvedRoundness = createMemo(() => Math.max(0, props.roundness ?? DEFAULT_ROUNDNESS));
	const blur = createMemo(() => resolvedRoundness() * BLUR_RATIO);

	let contentRef: HTMLDivElement | undefined;
	const headerExitRef = { current: null as number | null };
	const autoExpandRef = { current: null as number | null };
	const autoCollapseRef = { current: null as number | null };
	const swapTimerRef = { current: null as number | null };
	const lastRefreshKeyRef = { current: props.refreshKey };
	const pendingRef = { current: null as { key?: string; payload: View } | null };

	const [headerCurrentKey, setHeaderCurrentKey] = createSignal(headerKey());
	const [headerCurrentView, setHeaderCurrentView] = createSignal<View>(view());
	const [headerPrevKey, setHeaderPrevKey] = createSignal<string | null>(null);
	const [headerPrevView, setHeaderPrevView] = createSignal<View | null>(null);

	let innerRef: HTMLDivElement | undefined;
	let headerEl: HTMLDivElement | undefined;
	let headerPadRef = null as number | null;
	let pillRo: ResizeObserver | null = null;
	let pillRaf = 0;
	let pillObserved: Element | null = null;

	const measurePill = () => {
		if (!innerRef || headerPadRef === null) return;
		const w = innerRef.scrollWidth + headerPadRef + PILL_PADDING;
		if (w > PILL_PADDING) {
			setPillWidth((prev) => (prev === w ? prev : w));
		}
	};

	createEffect(() => {
		headerKey();
		if (!innerRef || !headerEl) return;
		if (headerPadRef === null) {
			const cs = getComputedStyle(headerEl);
			headerPadRef = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
		}
		measurePill();

		if (!pillRo) {
			pillRo = new ResizeObserver(() => {
				cancelAnimationFrame(pillRaf);
				pillRaf = requestAnimationFrame(() => {
					if (!innerRef || headerPadRef === null) return;
					const w = innerRef.scrollWidth + headerPadRef + PILL_PADDING;
					if (w > PILL_PADDING) {
						setPillWidth((prev) => (prev === w ? prev : w));
					}
				});
			});
		}

		if (pillObserved !== innerRef) {
			if (pillObserved) pillRo.unobserve(pillObserved);
			pillRo.observe(innerRef);
			pillObserved = innerRef;
		}
	});

	onCleanup(() => {
		cancelAnimationFrame(pillRaf);
		pillRo?.disconnect();
	});

	createEffect(() => {
		if (!hasDesc()) {
			setContentHeight(0);
			return;
		}
		const el = contentRef;
		if (!el) return;
		const measure = () => {
			const h = el.scrollHeight;
			setContentHeight((prev) => (prev === h ? prev : h));
		};
		measure();
		let rafId = 0;
		const ro = new ResizeObserver(() => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(measure);
		});
		ro.observe(el);
		onCleanup(() => {
			cancelAnimationFrame(rafId);
			ro.disconnect();
		});
	});

	onMount(() => {
		const raf = requestAnimationFrame(() => setReady(true));
		return () => cancelAnimationFrame(raf);
	});

	createEffect(() => {
		const hk = headerKey();
		const v = view();
		if (headerCurrentKey() === hk) {
			if (headerCurrentView() === v) return;
			setHeaderCurrentView(v);
		} else {
			setHeaderPrevKey(headerCurrentKey());
			setHeaderPrevView(headerCurrentView());
			setHeaderCurrentKey(hk);
			setHeaderCurrentView(v);
		}
	});

	createEffect(() => {
		if (!headerPrevKey()) return;
		if (headerExitRef.current) clearTimeout(headerExitRef.current);
		headerExitRef.current = window.setTimeout(() => {
			headerExitRef.current = null;
			setHeaderPrevKey(null);
			setHeaderPrevView(null);
		}, HEADER_EXIT_MS);
		return () => {
			if (headerExitRef.current) {
				clearTimeout(headerExitRef.current);
				headerExitRef.current = null;
			}
		};
	});

	createEffect(() => {
		const f = props.fill;
		if (f !== undefined && view().fill !== f) {
			setView((prev) => ({ ...prev, fill: f }));
		}
	});

	createEffect(() => {
		const rk = props.refreshKey;
		const n = next();

		if (rk === undefined) {
			setView(n);
			setApplied(undefined);
			pendingRef.current = null;
			lastRefreshKeyRef.current = rk;
			return;
		}

		if (lastRefreshKeyRef.current === rk) return;
		lastRefreshKeyRef.current = rk;

		if (swapTimerRef.current) {
			clearTimeout(swapTimerRef.current);
			swapTimerRef.current = null;
		}

		if (open()) {
			pendingRef.current = { key: rk, payload: n };
			setIsExpanded(false);
			swapTimerRef.current = window.setTimeout(() => {
				swapTimerRef.current = null;
				const pending = pendingRef.current;
				if (!pending) return;
				setView(pending.payload);
				setApplied(pending.key);
				pendingRef.current = null;
			}, SWAP_COLLAPSE_MS);
		} else {
			pendingRef.current = null;
			setView(n);
			setApplied(rk);
		}
	});

	createEffect(() => {
		const hd = hasDesc();
		if (!hd) return;

		if (autoExpandRef.current) clearTimeout(autoExpandRef.current);
		if (autoCollapseRef.current) clearTimeout(autoCollapseRef.current);

		if (props.exiting || !allowExpand()) {
			setIsExpanded(false);
			return;
		}

		if (props.autoExpandDelayMs == null && props.autoCollapseDelayMs == null) return;

		const expandDelay = props.autoExpandDelayMs ?? 0;
		const collapseDelay = props.autoCollapseDelayMs ?? 0;

		if (expandDelay > 0) {
			autoExpandRef.current = window.setTimeout(() => setIsExpanded(true), expandDelay);
		} else {
			setIsExpanded(true);
		}

		if (collapseDelay > 0) {
			autoCollapseRef.current = window.setTimeout(() => setIsExpanded(false), collapseDelay);
		}

		return () => {
			if (autoExpandRef.current) clearTimeout(autoExpandRef.current);
			if (autoCollapseRef.current) clearTimeout(autoCollapseRef.current);
		};
	});

	const minExpanded = HEIGHT * MIN_EXPAND_RATIO;
	const rawExpanded = createMemo(() =>
		hasDesc() ? Math.max(minExpanded, HEIGHT + contentHeight()) : minExpanded
	);

	const frozenExpandedRef = { current: minExpanded };
	createEffect(() => {
		if (open()) {
			frozenExpandedRef.current = rawExpanded();
		}
	});

	const expanded = open() ? rawExpanded() : frozenExpandedRef.current;
	const svgHeight = hasDesc() ? Math.max(expanded, minExpanded) : HEIGHT;
	const expandedContent = Math.max(0, expanded - HEIGHT);
	const resolvedPillWidth = createMemo(() => Math.max(pillWidth() || HEIGHT, HEIGHT));
	const pillHeight = HEIGHT + blur() * 3;

	const pillX = createMemo(() =>
		props.position === "right"
			? WIDTH - resolvedPillWidth()
			: props.position === "center"
				? (WIDTH - resolvedPillWidth()) / 2
				: 0
	);

	const viewBox = `0 0 ${WIDTH} ${svgHeight}`;
	const canvasStyle = createMemo(() => ({ filter: `url(#${filterId})` }));

	const rootStyle = createMemo(() => ({
		"--_h": `${open() ? expanded : HEIGHT}px`,
		"--_pw": `${resolvedPillWidth()}px`,
		"--_px": `${pillX()}px`,
		"--_ht": `translateY(${open() ? (props.expand === "bottom" ? 3 : -3) : 0}px) scale(${open() ? 0.9 : 1})`,
		"--_co": `${open() ? 1 : 0}`,
	}));

	const handleEnter = (e: MouseEvent) => {
		props.onMouseEnter?.(e);
		if (hasDesc()) setIsExpanded(true);
	};

	const handleLeave = (e: MouseEvent) => {
		props.onMouseLeave?.(e);
		setIsExpanded(false);
	};

	const handleTransitionEnd = (e: TransitionEvent) => {
		if (e.propertyName !== "height" && e.propertyName !== "transform") return;
		if (open()) return;
		const pending = pendingRef.current;
		if (!pending) return;
		if (swapTimerRef.current) {
			clearTimeout(swapTimerRef.current);
			swapTimerRef.current = null;
		}
		setView(pending.payload);
		setApplied(pending.key);
		pendingRef.current = null;
	};

	const SWIPE_DISMISS = 30;
	const SWIPE_MAX = 20;
	let buttonRef: HTMLButtonElement | undefined;
	const pointerStartRef = { current: null as number | null };
	const onDismissRef = { current: props.onDismiss };
	onDismissRef.current = props.onDismiss;

	const swipeHandlers = {
		onMove: (e: PointerEvent) => {
			if (pointerStartRef.current === null || !buttonRef) return;
			const dy = e.clientY - pointerStartRef.current;
			const sign = dy > 0 ? 1 : -1;
			const clamped = Math.min(Math.abs(dy), SWIPE_MAX) * sign;
			buttonRef.style.transform = `translateY(${clamped}px)`;
		},
		onUp: (e: PointerEvent) => {
			if (pointerStartRef.current === null || !buttonRef) return;
			const dy = e.clientY - pointerStartRef.current;
			pointerStartRef.current = null;
			buttonRef.style.transform = "";
			buttonRef.removeEventListener("pointermove", swipeHandlers.onMove);
			buttonRef.removeEventListener("pointerup", swipeHandlers.onUp);
			if (Math.abs(dy) > SWIPE_DISMISS) {
				onDismissRef.current?.();
			}
		},
	};

	const handleButtonClick = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		view().button?.onClick();
	};

	const handlePointerDown = (e: PointerEvent) => {
		if (props.exiting || !props.onDismiss) return;
		const target = e.target as HTMLElement;
		if (target.closest("[data-sileo-button]")) return;
		pointerStartRef.current = e.clientY;
		(e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
		if (buttonRef) {
			buttonRef.addEventListener("pointermove", swipeHandlers.onMove, { passive: true });
			buttonRef.addEventListener("pointerup", swipeHandlers.onUp, { passive: true });
		}
	};

	let pillRef: SVGRectElement | undefined;
	let bodyRef: SVGRectElement | undefined;

	createEffect(() => {
		if (!pillRef || !ready()) return;
		const px = pillX();
		const pw = resolvedPillWidth();
		const ph = open() ? pillHeight : HEIGHT;
		animate(pillRef, { x: px, width: pw, height: ph }, ready() ? SPRING_CONFIG : INSTANT);
	});

	createEffect(() => {
		if (!bodyRef || !ready()) return;
		const bh = open() ? expandedContent : 0;
		const bo = open() ? 1 : 0;
		animate(bodyRef, { height: bh, opacity: bo }, open() ? SPRING_CONFIG : SPRING_NO_BOUNCE);
	});

	const curView = headerCurrentView();
	const prevView = headerPrevView();

	return (
		<button
			ref={buttonRef}
			type="button"
			data-sileo-toast
			data-ready={ready()}
			data-expanded={open()}
			data-exiting={props.exiting}
			data-edge={props.expand}
			data-position={props.position}
			data-state={view().state}
			class={props.class}
			style={rootStyle()}
			onMouseEnter={handleEnter}
			onMouseLeave={handleLeave}
			onTransitionEnd={handleTransitionEnd}
			onPointerDown={handlePointerDown}
		>
			<div data-sileo-canvas data-edge={props.expand} style={canvasStyle()}>
				<svg data-sileo-svg width={WIDTH} height={svgHeight} viewBox={viewBox}>
					<title>Sileo Notification</title>
					<GooeyDefs filterId={filterId} blur={blur()} />
					<rect
						ref={pillRef}
						data-sileo-pill
						rx={resolvedRoundness()}
						ry={resolvedRoundness()}
						fill={view().fill}
					/>
					<rect
						ref={bodyRef}
						data-sileo-body
						y={HEIGHT}
						width={WIDTH}
						rx={resolvedRoundness()}
						ry={resolvedRoundness()}
						fill={view().fill}
					/>
				</svg>
			</div>

			<div ref={headerEl} data-sileo-header data-edge={props.expand}>
				<div data-sileo-header-stack>
					<div
						ref={innerRef}
						data-sileo-header-inner
						data-layer="current"
					>
						<div
							data-sileo-badge
							data-state={curView.state}
							class={curView.styles?.badge}
						>
							{curView.icon ?? STATE_ICON[curView.state]}
						</div>
						<span
							data-sileo-title
							data-state={curView.state}
							class={curView.styles?.title}
						>
							{curView.title}
						</span>
					</div>
					<Show when={prevView}>
						{(pv) => (
							<div
								data-sileo-header-inner
								data-layer="prev"
								data-exiting="true"
							>
								<div
									data-sileo-badge
									data-state={pv().state}
									class={pv().styles?.badge}
								>
									{pv().icon ?? STATE_ICON[pv().state]}
								</div>
								<span
									data-sileo-title
									data-state={pv().state}
									class={pv().styles?.title}
								>
									{pv().title}
								</span>
							</div>
						)}
					</Show>
				</div>
			</div>

			{hasDesc() && (
				<div data-sileo-content data-edge={props.expand} data-visible={open()}>
					<div
						ref={contentRef}
						data-sileo-description
						class={view().styles?.description}
					>
						{view().description}
						{view().button && (
							<a
								href="#"
								type="button"
								data-sileo-button
								data-state={view().state}
								class={view().styles?.button}
								onClick={handleButtonClick}
							>
								{view().button?.title}
							</a>
						)}
					</div>
				</div>
			)}
		</button>
	);
}
