import { useEffect, useState, useCallback } from 'react'
import {
  Sparkles, Upload, Eraser, Wand2, Star, Trash2, X, Download, RotateCw,
  Loader2, ImagePlus, AlertCircle, Smartphone, Type,
} from 'lucide-react'
import { useAppStore } from '../store'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { cn } from '../lib/cn'
import {
  IMAGE_MODELS,
  ASPECT_RATIOS,
  IMAGE_SIZES,
  MODEL_CAPABILITIES,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_SIZE,
  REACTION_PRESETS,
  VERTICAL_THUMBNAIL_PROMPT,
  type ImageModelId,
  type AspectRatioValue,
  type ImageSizeValue,
  fileToBase64,
} from '../lib/ai-photos'

/** Read an image source (data: URL or http URL) to base64 with no prefix. */
async function imageSrcToBase64(src: string): Promise<string> {
  if (src.startsWith('data:')) return src.split(',')[1] ?? ''
  const res = await fetch(src)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('file-read-failed'))
    reader.readAsDataURL(blob)
  })
}

interface AiPhotoItem {
  id: string
  memberId: string
  reactionId: string | null
  reactionLabel: string | null
  imageUrl: string
  fileName: string | null
  model: string | null
  aspectRatio: string | null
  prompt: string | null
  imageType: 'reaction' | 'text-to-image' | 'remove-bg' | 'upscale' | 'vertical-thumbnail' | string
  isFavorite: boolean
  createdAt: string
}

const IMAGE_TYPE_FILTERS: Array<{ value: string | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'reaction', label: 'Reactions' },
  { value: 'text-to-image', label: 'Generated' },
  { value: 'remove-bg', label: 'BG removed' },
  { value: 'upscale', label: 'Upscaled' },
  { value: 'vertical-thumbnail', label: 'Vertical' },
]

export function AiPhotos(): JSX.Element {
  const signedIn = useAppStore((s) => s.signedIn)
  const [model, setModel] = useState<ImageModelId>(DEFAULT_IMAGE_MODEL)
  const [aspectRatio, setAspectRatio] = useState<AspectRatioValue>(DEFAULT_ASPECT_RATIO)
  const [imageSize, setImageSize] = useState<ImageSizeValue>(DEFAULT_IMAGE_SIZE)
  const [prompt, setPrompt] = useState('')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [running, setRunning] = useState<string | null>(null) // preset id or "custom" / "remove-bg" / "upscale"
  const [error, setError] = useState<string | null>(null)

  const [items, setItems] = useState<AiPhotoItem[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selected, setSelected] = useState<AiPhotoItem | null>(null)
  const [activeImage, setActiveImage] = useState<string | null>(null) // selected source for Edit

  const supportsImageSize = MODEL_CAPABILITIES[model]?.supportsImageSize ?? false

  const loadList = useCallback(
    async (p = 1): Promise<void> => {
      if (!signedIn) return
      setLoadingList(true)
      try {
        const data = await window.aiPhotos.list({
          page: p,
          limit: 30,
          ...(filter ? { imageType: filter } : {}),
          ...(favoritesOnly ? { favoritesOnly: true } : {}),
        })
        setItems(data.reactions ?? [])
        setTotalPages(data.totalPages ?? 1)
        setPage(data.currentPage ?? p)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoadingList(false)
      }
    },
    [signedIn, filter, favoritesOnly],
  )

  useEffect(() => {
    if (signedIn) loadList(1)
  }, [signedIn, filter, favoritesOnly, loadList])

  const runGenerate = async (args: {
    presetId: string | null
    presetLabel: string | null
    finalPrompt: string
  }): Promise<void> => {
    if (!signedIn || running) return
    if (!args.finalPrompt.trim()) {
      setError('aiphotos-missing-prompt')
      return
    }
    setRunning(args.presetId ?? 'custom')
    setError(null)
    try {
      const images: string[] = []
      if (referenceFile) {
        images.push(await fileToBase64(referenceFile))
      }
      const r = await window.aiPhotos.generate({
        prompt: args.finalPrompt,
        ...(images.length ? { images } : {}),
        reactionId: args.presetId,
        reactionLabel: args.presetLabel,
        fileName: referenceFile?.name ?? null,
        model,
        aspectRatio,
        ...(supportsImageSize ? { imageSize } : {}),
        imageType: args.presetId ? 'reaction' : 'text-to-image',
      })
      window.dispatchEvent(new Event('credits:refresh'))
      await loadList(1)
      if (r?.imageUrl) {
        // Open the viewer immediately on the freshest item.
        setTimeout(() => setSelected(findItemByUrl(r.imageUrl)), 200)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(null)
    }
  }

  const findItemByUrl = (url: string): AiPhotoItem | null => {
    return items.find((it) => it.imageUrl === url) ?? null
  }

  const runEdit = async (kind: 'remove-bg' | 'upscale'): Promise<void> => {
    if (!signedIn || running || !activeImage) return
    setRunning(kind)
    setError(null)
    try {
      const r =
        kind === 'remove-bg'
          ? await window.aiPhotos.removeBg({ imageUrl: activeImage })
          : await window.aiPhotos.upscale({ imageUrl: activeImage })
      window.dispatchEvent(new Event('credits:refresh'))
      await loadList(1)
      if (r?.imageUrl) setActiveImage(r.imageUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(null)
    }
  }

  // Turn the selected horizontal thumbnail into a vertical 9:16 Shorts thumbnail.
  const runToVertical = async (): Promise<void> => {
    if (!signedIn || running || !activeImage) return
    setRunning('to-vertical')
    setError(null)
    try {
      const base64 = await imageSrcToBase64(activeImage)
      const r = await window.aiPhotos.generate({
        prompt: VERTICAL_THUMBNAIL_PROMPT,
        images: [base64],
        reactionId: 'vertical-thumbnail',
        reactionLabel: 'Vertical Thumbnail',
        model,
        aspectRatio: '9:16',
        imageType: 'vertical-thumbnail',
      })
      window.dispatchEvent(new Event('credits:refresh'))
      await loadList(1)
      if (r?.imageUrl) setTimeout(() => setSelected(findItemByUrl(r.imageUrl)), 200)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(null)
    }
  }

  const toggleFavorite = async (item: AiPhotoItem): Promise<void> => {
    const next = !item.isFavorite
    setItems((arr) => arr.map((it) => (it.id === item.id ? { ...it, isFavorite: next } : it)))
    try {
      await window.aiPhotos.favorite({ id: item.id, isFavorite: next })
    } catch (e) {
      // Roll back on failure.
      setItems((arr) => arr.map((it) => (it.id === item.id ? { ...it, isFavorite: !next } : it)))
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const deleteItem = async (item: AiPhotoItem): Promise<void> => {
    if (!window.confirm('Delete this image? This cannot be undone.')) return
    const prev = items
    setItems((arr) => arr.filter((it) => it.id !== item.id))
    if (selected?.id === item.id) setSelected(null)
    if (activeImage === item.imageUrl) setActiveImage(null)
    try {
      await window.aiPhotos.delete({ id: item.id })
    } catch (e) {
      setItems(prev) // restore
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!signedIn) {
    return (
      <div className="view view--wide">
        <div className="flex flex-col items-center justify-center text-center gap-2 rounded-lg border border-border bg-muted py-10 px-6">
          <Sparkles className="size-7 text-muted-foreground" />
          <h3 className="text-md font-medium text-foreground">Sign in to use AI Photos</h3>
          <p className="max-w-sm text-base text-muted-foreground leading-relaxed">
            Generate reaction images, remove backgrounds, and upscale stills.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="view view--wide space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">AI Photos</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Generate reactions, remove backgrounds, and upscale stills with Gemini image models.
        </p>
      </header>

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <AlertCircle className="size-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-xs text-foreground">{prettifyError(error)}</div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-muted-foreground hover:text-foreground"
            title="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* ── Gallery ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="size-1.5 rounded-full bg-primary" />
                Gallery
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant={favoritesOnly ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setFavoritesOnly((v) => !v)}
                  className="h-7 gap-1.5 px-2 text-xs"
                  title="Show favorites only"
                  aria-pressed={favoritesOnly}
                >
                  <Star
                    className={cn('size-3.5', favoritesOnly && 'fill-primary text-primary')}
                  />
                  Favorites
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadList(page)}
                  disabled={loadingList}
                  className="size-7 p-0"
                  title="Refresh"
                >
                  <RotateCw className={cn('size-3.5', loadingList && 'animate-spin')} />
                </Button>
              </div>
            </div>
            <CardDescription className="text-[11px]">
              {items.length === 0 && !loadingList
                ? 'Nothing here yet — generate or edit an image to start your gallery.'
                : `${items.length} on this page · page ${page} of ${totalPages}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="-mx-1 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-1 px-1">
                {IMAGE_TYPE_FILTERS.map((f) => {
                  const active = filter === f.value
                  return (
                    <button
                      key={f.label}
                      type="button"
                      onClick={() => setFilter(f.value)}
                      className={cn(
                        'whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {loadingList && items.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted-foreground">Loading…</div>
            ) : items.length === 0 ? (
              <div className="text-center py-12">
                <ImagePlus className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">
                  Generate a reaction or upload an image to remove its background.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {items.map((it) => (
                  <GalleryCard
                    key={it.id}
                    item={it}
                    isActive={activeImage === it.imageUrl}
                    onOpen={() => setSelected(it)}
                    onPick={() => setActiveImage(it.imageUrl)}
                    onFavorite={() => toggleFavorite(it)}
                    onDelete={() => deleteItem(it)}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 ? (
              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadList(Math.max(1, page - 1))}
                  disabled={page <= 1 || loadingList}
                  className="h-7 text-xs"
                >
                  Previous
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadList(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages || loadingList}
                  className="h-7 text-xs"
                >
                  Next
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* ── Controls ─────────────────────────────────────── */}
        <Card className="self-start">
          <CardContent className="pt-4">
            <Tabs defaultValue="generate">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="generate" className="gap-1.5">
                  <Sparkles className="size-3.5" />
                  Generate
                </TabsTrigger>
                <TabsTrigger value="edit" className="gap-1.5">
                  <Wand2 className="size-3.5" />
                  Edit
                </TabsTrigger>
              </TabsList>

              <TabsContent value="generate" className="mt-4 space-y-3">
                <Field label="Model">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value as ImageModelId)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                  >
                    {IMAGE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Aspect ratio">
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as AspectRatioValue)}
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                    >
                      {ASPECT_RATIOS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {supportsImageSize ? (
                    <Field label="Resolution">
                      <select
                        value={imageSize}
                        onChange={(e) => setImageSize(e.target.value as ImageSizeValue)}
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                      >
                        {IMAGE_SIZES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : (
                    <div />
                  )}
                </div>

                <Field label="Reference image (optional)">
                  <ReferenceFilePicker
                    file={referenceFile}
                    onChange={setReferenceFile}
                    disabled={!!running}
                  />
                </Field>

                <Field label="Prompt">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the image you want, or pick a reaction preset below…"
                    rows={3}
                    disabled={!!running}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-y"
                  />
                </Field>

                <Button
                  onClick={() =>
                    runGenerate({ presetId: null, presetLabel: null, finalPrompt: prompt })
                  }
                  disabled={!!running || !prompt.trim()}
                  className="w-full gap-1.5"
                >
                  {running === 'custom' ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      Generate
                    </>
                  )}
                </Button>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Reaction presets (need a reference image)
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {REACTION_PRESETS.map((p) => {
                      const Icon = p.icon
                      const isRunning = running === p.id
                      const disabled = !!running || !referenceFile
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            runGenerate({
                              presetId: p.id,
                              presetLabel: p.label,
                              finalPrompt: p.prompt,
                            })
                          }
                          className={cn(
                            'flex flex-col items-center gap-1.5 rounded-md border border-border bg-card p-2.5 text-center transition-all',
                            'hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
                            isRunning && 'border-primary bg-accent',
                          )}
                          title={p.label}
                        >
                          <span className="flex size-7 items-center justify-center rounded-md bg-primary-soft text-primary [&>svg]:size-4">
                            {isRunning ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Icon />
                            )}
                          </span>
                          <span className="text-[11px] leading-tight text-foreground line-clamp-2">
                            {p.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {!referenceFile ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Upload a reference image to use presets.
                    </p>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="edit" className="mt-4 space-y-3">
                <Field label="Source image">
                  {activeImage ? (
                    <div className="relative">
                      <img
                        src={activeImage}
                        alt=""
                        className="w-full rounded-md border border-border bg-card object-cover max-h-48"
                      />
                      <button
                        type="button"
                        onClick={() => setActiveImage(null)}
                        className="absolute top-1 right-1 size-6 rounded-md bg-card/90 backdrop-blur-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center border border-border"
                        title="Clear"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-border bg-card/40 p-4 text-center">
                      <ImagePlus className="mx-auto size-5 text-muted-foreground" />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Click an image in the gallery to use it, or upload one below.
                      </p>
                      <EditUpload
                        onLoaded={(url) => setActiveImage(url)}
                        disabled={!!running}
                      />
                    </div>
                  )}
                </Field>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => runEdit('remove-bg')}
                    disabled={!activeImage || !!running}
                    className="gap-1.5"
                  >
                    {running === 'remove-bg' ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Working…
                      </>
                    ) : (
                      <>
                        <Eraser className="size-3.5" />
                        Remove BG
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => runEdit('upscale')}
                    disabled={!activeImage || !!running}
                    className="gap-1.5"
                  >
                    {running === 'upscale' ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Working…
                      </>
                    ) : (
                      <>
                        <Wand2 className="size-3.5" />
                        Upscale
                      </>
                    )}
                  </Button>
                </div>

                <Button
                  onClick={() => runToVertical()}
                  disabled={!activeImage || !!running}
                  className="w-full gap-1.5"
                >
                  {running === 'to-vertical' ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Making vertical…
                    </>
                  ) : (
                    <>
                      <Smartphone className="size-3.5" />
                      To Vertical (9:16)
                    </>
                  )}
                </Button>

                <p className="text-[11px] text-muted-foreground">
                  “To Vertical” turns a horizontal YouTube thumbnail into a 9:16 Shorts thumbnail — the
                  subject stays centered and the background is extended to fill. Results land in the gallery.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {selected ? (
        <ImageViewer
          item={selected}
          onClose={() => setSelected(null)}
          onUseAsReference={(item) => {
            setActiveImage(item.imageUrl)
            setSelected(null)
          }}
          onDelete={deleteItem}
          onFavorite={toggleFavorite}
        />
      ) : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function ReferenceFilePicker({
  file,
  onChange,
  disabled,
}: {
  file: File | null
  onChange: (f: File | null) => void
  disabled: boolean
}): JSX.Element {
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (file && preview) {
    return (
      <div className="relative">
        <img
          src={preview}
          alt=""
          className="w-full rounded-md border border-border object-cover max-h-32"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className="absolute top-1 right-1 size-6 rounded-md bg-card/90 backdrop-blur-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center border border-border"
          title="Remove reference"
        >
          <X className="size-3" />
        </button>
        <p className="mt-1 text-[11px] text-muted-foreground truncate">{file.name}</p>
      </div>
    )
  }

  return (
    <label
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-card/40 px-3 py-2.5 text-xs text-muted-foreground cursor-pointer transition-colors',
        'hover:border-primary hover:text-foreground',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <Upload className="size-3.5" />
      <span>Upload reference</span>
      <input
        type="file"
        accept="image/*"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onChange(f)
          e.target.value = ''
        }}
        className="hidden"
      />
    </label>
  )
}

function EditUpload({
  onLoaded,
  disabled,
}: {
  onLoaded: (dataUrl: string) => void
  disabled: boolean
}): JSX.Element {
  return (
    <label
      className={cn(
        'mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1 text-[11px] text-foreground cursor-pointer transition-colors',
        'hover:bg-accent',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <Upload className="size-3" />
      <span>Upload image</span>
      <input
        type="file"
        accept="image/*"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const reader = new FileReader()
          reader.onload = () => {
            if (typeof reader.result === 'string') onLoaded(reader.result)
          }
          reader.readAsDataURL(f)
          e.target.value = ''
        }}
        className="hidden"
      />
    </label>
  )
}

function GalleryCard({
  item,
  isActive,
  onOpen,
  onPick,
  onFavorite,
  onDelete,
}: {
  item: AiPhotoItem
  isActive: boolean
  onOpen: () => void
  onPick: () => void
  onFavorite: () => void
  onDelete: () => void
}): JSX.Element {
  return (
    <div
      className={cn(
        'group relative aspect-square overflow-hidden rounded-md border border-border bg-card',
        isActive && 'ring-2 ring-primary',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 size-full"
        title={item.reactionLabel ?? item.imageType}
      >
        <img
          src={item.imageUrl}
          alt={item.reactionLabel ?? ''}
          loading="lazy"
          className="size-full object-cover"
        />
      </button>

      <div className="absolute top-1 left-1 right-1 flex items-start justify-between gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <span className="rounded-sm bg-card/90 backdrop-blur-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-foreground border border-border">
          {item.imageType}
        </span>
        <div className="flex items-center gap-0.5 pointer-events-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPick()
            }}
            className="size-6 rounded-md bg-card/90 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center"
            title="Use in Edit"
          >
            <Wand2 className="size-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="size-6 rounded-md bg-card/90 backdrop-blur-sm border border-border text-muted-foreground hover:text-destructive inline-flex items-center justify-center"
            title="Delete"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onFavorite()
        }}
        className={cn(
          'absolute bottom-1 right-1 size-6 rounded-md bg-card/90 backdrop-blur-sm border border-border inline-flex items-center justify-center transition-colors',
          item.isFavorite
            ? 'text-primary'
            : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground',
        )}
        title={item.isFavorite ? 'Unfavorite' : 'Favorite'}
      >
        <Star className={cn('size-3', item.isFavorite && 'fill-primary')} />
      </button>
    </div>
  )
}

function ImageViewer({
  item,
  onClose,
  onUseAsReference,
  onDelete,
  onFavorite,
}: {
  item: AiPhotoItem
  onClose: () => void
  onUseAsReference: (item: AiPhotoItem) => void
  onDelete: (item: AiPhotoItem) => void
  onFavorite: (item: AiPhotoItem) => void
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const [saving, setSaving] = useState(false)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const sendImageToStudio = useAppStore((s) => s.sendImageToStudio)

  /**
   * Hand the image to Studio as a picture layer. Studio documents embed their
   * images, and the renderer can't fetch cross-origin bytes, so main pulls it
   * down as a data URL first.
   */
  const sendToStudio = async (): Promise<void> => {
    if (sending) return
    setSending(true)
    setSaveNote(null)
    try {
      const res = await window.aiPhotos.fetchDataUrl({ imageUrl: item.imageUrl })
      if ('error' in res) {
        setSaveNote(`Couldn't send to Studio: ${res.error}`)
        return
      }
      sendImageToStudio(res.dataUrl)
      onClose()
    } catch (err) {
      setSaveNote(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  // The images are served from another origin, where Chromium ignores an
  // anchor's `download` attribute and navigates to the file instead — in a
  // frameless app that swaps the whole UI for the picture with no way back.
  // Main fetches the bytes and writes them through a native save dialog.
  const download = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    setSaveNote(null)
    try {
      const suggestedName = `${item.reactionLabel ?? item.imageType ?? 'image'}-${item.id}`
      const res = await window.aiPhotos.saveImage({ imageUrl: item.imageUrl, suggestedName })
      if (res && 'filePath' in res) setSaveNote(`Saved to ${res.filePath}`)
      else if (res && 'error' in res) setSaveNote(`Couldn't save: ${res.error}`)
    } catch (err) {
      setSaveNote(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl w-full max-h-[90vh] flex flex-col rounded-lg border border-border bg-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="rounded-sm bg-primary-soft px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-primary">
                {item.imageType}
              </span>
              {item.reactionLabel ? (
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {item.reactionLabel}
                </h3>
              ) : null}
            </div>
            {item.model ? (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {item.model.replace('google/', '')} · {item.aspectRatio ?? ''}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void sendToStudio()}
              disabled={sending}
              title="Add this image to the thumbnail you're designing"
            >
              {sending ? <RotateCw className="size-4 animate-spin" /> : <Type className="size-4" />}
              Send to Studio
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFavorite(item)}
              className="size-8 p-0"
              title={item.isFavorite ? 'Unfavorite' : 'Favorite'}
            >
              <Star
                className={cn(
                  'size-4',
                  item.isFavorite ? 'fill-primary text-primary' : 'text-muted-foreground',
                )}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void download()}
              disabled={saving}
              className="size-8 p-0"
              title="Download"
            >
              {saving ? (
                <RotateCw className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <Download className="size-4 text-muted-foreground" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUseAsReference(item)}
              className="size-8 p-0"
              title="Use as reference"
            >
              <Wand2 className="size-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(item)}
              className="size-8 p-0"
              title="Delete"
            >
              <Trash2 className="size-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="size-8 p-0"
              title="Close (Esc)"
            >
              <X className="size-4 text-muted-foreground" />
            </Button>
          </div>
        </header>
        {saveNote ? (
          <div className="border-b border-border bg-secondary px-4 py-1.5">
            <p className="truncate text-[11px] text-muted-foreground" title={saveNote}>
              {saveNote}
            </p>
          </div>
        ) : null}
        <div className="flex-1 overflow-auto bg-background flex items-center justify-center p-4">
          <img
            src={item.imageUrl}
            alt={item.reactionLabel ?? ''}
            className="max-w-full max-h-[70vh] object-contain rounded"
          />
        </div>
        {item.prompt ? (
          <footer className="px-4 py-2.5 border-t border-border bg-secondary max-h-32 overflow-auto">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Prompt
            </div>
            <p className="text-[11px] text-foreground/90 leading-relaxed">{item.prompt}</p>
          </footer>
        ) : null}
      </div>
    </div>
  )
}

function prettifyError(raw: string): string {
  if (raw.includes('not-signed-in')) return 'Sign in to use AI Photos.'
  if (raw.includes('aiphotos-missing-prompt')) return 'Enter a prompt or pick a preset first.'
  if (raw.includes('aiphotos-missing-image')) return 'Pick a source image before running.'
  if (raw.includes('aiphotos-failed: 401')) return 'Session expired — sign in again.'
  if (raw.includes('aiphotos-failed: 429')) return 'Rate limited — try again in a moment.'
  if (raw.includes('aiphotos-failed: 402') || raw.toLowerCase().includes('insufficient'))
    return 'Not enough credits. Upgrade or wait for renewal.'
  if (raw.includes('aiphotos-failed')) return 'The image service rejected the request.'
  return raw
}
