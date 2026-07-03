"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { useLazyRef } from "@/hooks/use-lazy-ref"
import { Button } from "@/app/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/app/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
  description?: string
  keywords?: string[]
}

interface ComboboxPreviewPlacement {
  left: number
  side: "left" | "right"
  top: number
}

interface ComboboxPreviewPlacementInput {
  optionRect: DOMRect
  previewRect: Pick<DOMRect, "height" | "width">
  viewportHeight: number
  viewportWidth: number
}

const COMBOBOX_PREVIEW_FALLBACK_WIDTH_PX = 288
const COMBOBOX_PREVIEW_GAP_PX = 12
const COMBOBOX_PREVIEW_VIEWPORT_PADDING_PX = 12

function clampComboboxPreviewCoordinate(value: number, minimum: number, maximum: number) {
  if (minimum > maximum) {
    return minimum
  }

  return Math.min(Math.max(value, minimum), maximum)
}

export function calculateComboboxPreviewPlacement({
  optionRect,
  previewRect,
  viewportHeight,
  viewportWidth,
}: ComboboxPreviewPlacementInput): ComboboxPreviewPlacement {
  const previewWidth = Math.max(previewRect.width, COMBOBOX_PREVIEW_FALLBACK_WIDTH_PX)
  const previewHeight = previewRect.height
  const spaceRight = viewportWidth - optionRect.right - COMBOBOX_PREVIEW_VIEWPORT_PADDING_PX
  const side = spaceRight >= previewWidth + COMBOBOX_PREVIEW_GAP_PX ? "right" : "left"
  const unclampedLeft = side === "right"
    ? optionRect.right + COMBOBOX_PREVIEW_GAP_PX
    : optionRect.left - previewWidth - COMBOBOX_PREVIEW_GAP_PX
  const unclampedTop = optionRect.top + optionRect.height / 2 - previewHeight / 2
  const maxLeft = Math.max(
    COMBOBOX_PREVIEW_VIEWPORT_PADDING_PX,
    viewportWidth - previewWidth - COMBOBOX_PREVIEW_VIEWPORT_PADDING_PX,
  )
  const maxTop = Math.max(
    COMBOBOX_PREVIEW_VIEWPORT_PADDING_PX,
    viewportHeight - previewHeight - COMBOBOX_PREVIEW_VIEWPORT_PADDING_PX,
  )

  return {
    left: clampComboboxPreviewCoordinate(
      unclampedLeft,
      COMBOBOX_PREVIEW_VIEWPORT_PADDING_PX,
      maxLeft,
    ),
    side,
    top: clampComboboxPreviewCoordinate(
      unclampedTop,
      COMBOBOX_PREVIEW_VIEWPORT_PADDING_PX,
      maxTop,
    ),
  }
}

interface ComboboxProps {
  emptyText?: string
  onValueChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  previewPaneTestId?: string
  renderOptionPreview?: (option: ComboboxOption) => React.ReactNode
  searchPlaceholder?: string
  triggerClassName?: string
  triggerTestId?: string
  value: string
  getOptionTestId?: (value: string) => string
}

function getComboboxListTestId(triggerTestId?: string) {
  return triggerTestId ? `${triggerTestId}-list` : undefined
}

function Combobox({
  emptyText = "No result found.",
  onValueChange,
  options,
  placeholder = "Select an option",
  previewPaneTestId,
  renderOptionPreview,
  searchPlaceholder = "Search...",
  triggerClassName,
  triggerTestId,
  value,
  getOptionTestId,
}: ComboboxProps) {
  const listId = React.useId()
  const [open, setOpen] = React.useState(false)
  const [previewPlacement, setPreviewPlacement] = React.useState<ComboboxPreviewPlacement | null>(null)
  const [previewedOptionValue, setPreviewedOptionValue] = React.useState<string | null>(null)
  const [previewVisible, setPreviewVisible] = React.useState(false)
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const optionRefs = useLazyRef(() => new Map<string, HTMLElement>())
  const previewPaneRef = React.useRef<HTMLDivElement | null>(null)
  const selectedOption = options.find((option) => option.value === value) ?? null
  const previewedOption = options.find((option) => option.value === previewedOptionValue) ?? null
  const listTestId = getComboboxListTestId(triggerTestId)
  const contentTestId = triggerTestId ? `${triggerTestId}-popover-content` : undefined
  const popoverSurfaceTestId = triggerTestId ? `${triggerTestId}-popover-surface` : undefined
  const hasPreviewPane = Boolean(renderOptionPreview)
  const previewPane = hasPreviewPane ? (
    <div
      aria-hidden={!previewVisible || !previewedOption}
      data-anchor-option={previewedOptionValue ?? undefined}
      data-side={previewPlacement?.side ?? "right"}
      data-state={previewVisible && previewedOption ? "visible" : "hidden"}
      data-testid={previewPaneTestId}
      ref={previewPaneRef}
      className={cn(
        "pointer-events-none fixed z-[60] w-72 transition-[opacity,transform] duration-200 ease-out",
        previewVisible && previewedOption
          ? "opacity-100 scale-100 translate-x-0"
          : previewPlacement?.side === "left"
            ? "opacity-0 scale-[0.98] -translate-x-2"
            : "opacity-0 scale-[0.98] translate-x-2",
      )}
      style={previewPlacement ? { left: `${previewPlacement.left}px`, top: `${previewPlacement.top}px` } : { left: "-9999px", top: "0px" }}
    >
      {previewedOption ? renderOptionPreview?.(previewedOption) : null}
    </div>
  ) : null

  const updatePreviewPlacement = React.useCallback(() => {
    if (!previewVisible || !previewedOptionValue) {
      setPreviewPlacement(null)
      return
    }

    const optionElement = optionRefs.current.get(previewedOptionValue)
    const previewElement = previewPaneRef.current

    if (!optionElement || !previewElement) {
      return
    }

    setPreviewPlacement(
      calculateComboboxPreviewPlacement({
        optionRect: optionElement.getBoundingClientRect(),
        previewRect: previewElement.getBoundingClientRect(),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      }),
    )
  }, [previewVisible, previewedOptionValue])

  React.useEffect(() => {
    if (!open || !listTestId) {
      return
    }

    let nestedAnimationFrameId = 0
    const animationFrameId = window.requestAnimationFrame(() => {
      nestedAnimationFrameId = window.requestAnimationFrame(() => {
        const listElement = document.querySelector<HTMLElement>(`[data-combobox-list="${listTestId}"]`)
        const selectedElement = document.querySelector<HTMLElement>(
          `[data-combobox-list="${listTestId}"] [data-selected-option="true"]`,
        )

        if (listElement && selectedElement) {
          const targetScrollTop = Math.max(
            selectedElement.offsetTop - listElement.clientHeight / 2 + selectedElement.offsetHeight / 2,
            0,
          )

          if (typeof listElement.scrollTo === "function") {
            listElement.scrollTo({ top: targetScrollTop })
          } else {
            listElement.scrollTop = targetScrollTop
          }
        }

        selectedElement?.scrollIntoView({ block: "center" })
      })
    })

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.cancelAnimationFrame(nestedAnimationFrameId)
    }
  }, [listTestId, open, value])

  React.useEffect(() => {
    if (open) {
      return
    }

    setPreviewVisible(false)
    setPreviewPlacement(null)
    setPreviewedOptionValue(null)
  }, [open])

  React.useEffect(() => {
    if (!previewedOptionValue) {
      return
    }

    if (options.some((option) => option.value === previewedOptionValue)) {
      return
    }

    setPreviewVisible(false)
    setPreviewPlacement(null)
    setPreviewedOptionValue(null)
  }, [options, previewedOptionValue])

  React.useLayoutEffect(() => {
    updatePreviewPlacement()
  }, [updatePreviewPlacement])

  React.useEffect(() => {
    if (!previewVisible || !previewedOptionValue) {
      return
    }

    let animationFrameId = 0
    const handlePositionChange = () => {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = window.requestAnimationFrame(updatePreviewPlacement)
    }

    const currentListElement = listRef.current

    window.addEventListener("resize", handlePositionChange)
    currentListElement?.addEventListener("scroll", handlePositionChange, { passive: true })

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.removeEventListener("resize", handlePositionChange)
      currentListElement?.removeEventListener("scroll", handlePositionChange)
    }
  }, [previewVisible, previewedOptionValue, updatePreviewPlacement])

  const handleListWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const listElement = event.currentTarget

    if (listElement.scrollHeight <= listElement.clientHeight) {
      return
    }

    if (typeof listElement.scrollBy === "function") {
      listElement.scrollBy({ top: event.deltaY })
    } else {
      listElement.scrollTop += event.deltaY
    }

    event.preventDefault()
  }, [])

  const showOptionPreview = React.useCallback((optionValue: string) => {
    if (!renderOptionPreview) {
      return
    }

    setPreviewPlacement(null)
    setPreviewedOptionValue(optionValue)
    setPreviewVisible(true)
  }, [renderOptionPreview])

  const hideOptionPreview = React.useCallback(() => {
    if (!renderOptionPreview) {
      return
    }

    setPreviewVisible(false)
  }, [renderOptionPreview])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          data-testid={triggerTestId}
          className={cn("flex w-full min-w-0 max-w-full justify-between overflow-hidden font-normal", triggerClassName)}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) overflow-visible p-0" data-testid={popoverSurfaceTestId}>
        <div
          data-testid={contentTestId}
          className="relative min-w-0"
          onMouseLeave={hideOptionPreview}
        >
          <Command className="min-w-0">
            <CommandInput placeholder={searchPlaceholder} onFocus={hideOptionPreview} />
            <div
              id={listId}
              data-combobox-list={listTestId}
              data-testid={listTestId}
              className="max-h-[300px] overflow-y-auto overscroll-contain"
              onWheel={handleListWheel}
              ref={listRef}
            >
              <CommandList className="max-h-none overflow-visible">
                <CommandEmpty>{emptyText}</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      ref={(element) => {
                        if (element) {
                          optionRefs.current.set(option.value, element)
                          return
                        }

                        optionRefs.current.delete(option.value)
                      }}
                      value={[option.label, option.value, ...(option.keywords ?? [])].join(" ")}
                      data-selected-option={value === option.value ? "true" : "false"}
                      data-testid={getOptionTestId?.(option.value)}
                      onFocus={() => showOptionPreview(option.value)}
                      onMouseEnter={() => showOptionPreview(option.value)}
                      onSelect={() => {
                        onValueChange(option.value)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "size-4",
                          value === option.value ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{option.label}</span>
                        {option.description ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        ) : null}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </div>
          </Command>
        </div>
      </PopoverContent>
      {previewPane && typeof document !== "undefined" ? createPortal(previewPane, document.body) : null}
    </Popover>
  )
}

export { Combobox }
