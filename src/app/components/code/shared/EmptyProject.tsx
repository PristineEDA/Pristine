import { useState } from "react"
import { ArrowUpRightIcon, FileTextIcon, FolderCodeIcon, ImageIcon, InfoIcon } from "lucide-react"
import { Button } from "../../ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../ui/empty"
import { IconTabToggleGroup } from "./IconTabToggleGroup"

type EmptyProjectTab = 'info' | 'image' | 'summary'

interface EmptyProjectProps {
  onCreateProject?: () => void
  onOpenProject?: () => void
}

const emptyWallpaperPath = "./generated/empty-wallpaper.png"
const emptyProjectTabs = [
  { value: 'info', label: 'Info', icon: InfoIcon, testId: 'empty-project-tab-info' },
  { value: 'image', label: 'Image', icon: ImageIcon, testId: 'empty-project-tab-image' },
  { value: 'summary', label: 'Summary', icon: FileTextIcon, testId: 'empty-project-tab-summary' },
] as const

function InfoContent({ onCreateProject, onOpenProject }: EmptyProjectProps) {
  return (
    <div data-testid="empty-project-info-panel" className="contents">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderCodeIcon />
        </EmptyMedia>
        <EmptyTitle>No Projects Yet</EmptyTitle>
        <EmptyDescription>
          You haven&apos;t opened any projects yet.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <Button data-testid="empty-project-create-project" onClick={onCreateProject}>Create Project</Button>
        <Button data-testid="empty-project-open-project" variant="outline" onClick={onOpenProject}>Open Project</Button>
      </EmptyContent>
      <Button
        variant="link"
        asChild
        className="text-ide-text-muted"
        size="sm"
      >
        <a href="https://github.com/maksyuki/pristine" target="_blank" rel="noreferrer">
          Learn More <ArrowUpRightIcon />
        </a>
      </Button>
    </div>
  )
}

function ImageContent() {
  const [imageUnavailable, setImageUnavailable] = useState(false)

  return (
    <div className="absolute inset-0" data-testid="empty-project-image-panel">
      <div className="relative h-full w-full overflow-hidden bg-ide-editor-bg">
        <div
          className={`absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.3),_transparent_45%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(30,41,59,0.88)_48%,_rgba(51,65,85,0.92))] transition-opacity ${imageUnavailable ? 'opacity-100' : 'opacity-30'}`}
          data-testid="empty-project-image-fallback"
        />
        {!imageUnavailable && (
          <img
            alt="Empty project preview"
            className="relative h-full w-full object-cover"
            data-testid="empty-project-image"
            src={emptyWallpaperPath}
            onError={() => setImageUnavailable(true)}
          />
        )}
      </div>
    </div>
  )
}

function SummaryContent() {
  return (
    <div
      data-testid="empty-project-summary-panel"
      className="flex w-full items-center justify-center text-ide-text-muted"
    >
      <div className="text-center">
        <p className="text-lg font-medium">Summary</p>
        <p className="mt-1 text-sm">Coming soon</p>
      </div>
    </div>
  )
}

export function EmptyProject({ onCreateProject, onOpenProject }: EmptyProjectProps) {
  const [activeTab, setActiveTab] = useState<EmptyProjectTab>('info')
  const isImageTab = activeTab === 'image'

  const renderTabContent = () => {
    if (activeTab === 'image') {
      return <ImageContent />
    }

    if (activeTab === 'summary') {
      return <SummaryContent />
    }

    return <InfoContent onCreateProject={onCreateProject} onOpenProject={onOpenProject} />
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <div className="relative flex h-full w-full items-center justify-center">
        {isImageTab ? (
          <div className="relative h-full w-full">
            {renderTabContent()}
          </div>
        ) : (
          <div className="flex w-full items-center justify-center px-6 pr-20 md:px-12 md:pr-24">
            <Empty className="max-w-4xl">
              {renderTabContent()}
            </Empty>
          </div>
        )}

        <div
          className="absolute top-1/2 right-2 z-10 -translate-y-1/2"
          data-testid="empty-project-tabs"
        >
          <IconTabToggleGroup
            items={emptyProjectTabs}
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value as EmptyProjectTab)
            }}
            orientation="vertical"
            groupLabel="Empty project tabs"
            tooltipSide="right"
          />
        </div>
      </div>
    </div>
  )
}
