import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import katex from 'katex';
import {
  Bold,
  Download,
  Eraser,
  FileDown,
  FolderOpen,
  ImagePlus,
  MousePointer2,
  Move,
  PenLine,
  Plus,
  Redo2,
  Save,
  Sigma,
  Type,
  Undo2
} from 'lucide-react';
import type {
  FormulaElement,
  ImageElement,
  InkElement,
  NoteDocument,
  NoteElement,
  NotePage,
  Point,
  TextElement,
  Tool
} from './types';

const STORAGE_KEY = 'easy-note-document-v1';
const PAGE_WIDTH = 1100;
const PAGE_HEIGHT = 780;

type TextStyle = {
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: number;
};

type PenStyle = {
  color: string;
  size: number;
};

type DragState = {
  elementId: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

const fontFamilies = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Microsoft YaHei', 'Consolas'];
const colorSwatches = ['#1f2a2a', '#006d77', '#8f2d56', '#d1495b', '#f4a261', '#2a9d8f'];

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createPage(index: number): NotePage {
  return {
    id: createId('page'),
    title: `Page ${index}`,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    elements: []
  };
}

function createDefaultDocument(): NoteDocument {
  const firstPage = createPage(1);
  return {
    title: 'Easy Note',
    pages: [firstPage],
    currentPageId: firstPage.id,
    updatedAt: new Date().toISOString()
  };
}

function loadInitialDocument(): NoteDocument {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createDefaultDocument();
    }
    const parsed = JSON.parse(stored) as NoteDocument;
    if (!parsed.pages?.length || !parsed.currentPageId) {
      return createDefaultDocument();
    }
    return parsed;
  } catch {
    return createDefaultDocument();
  }
}

function touch(documentData: NoteDocument): NoteDocument {
  return {
    ...documentData,
    updatedAt: new Date().toISOString()
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (lengthSquared === 0) {
    return pointDistance(point, a);
  }
  const t = clamp(
    ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lengthSquared,
    0,
    1
  );
  return pointDistance(point, {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y)
  });
}

function distanceToStroke(point: Point, stroke: InkElement): number {
  if (stroke.points.length < 2) {
    return stroke.points[0] ? pointDistance(point, stroke.points[0]) : Number.POSITIVE_INFINITY;
  }

  return stroke.points
    .slice(1)
    .reduce(
      (nearest, current, index) =>
        Math.min(nearest, distanceToSegment(point, stroke.points[index], current)),
      Number.POSITIVE_INFINITY
    );
}

function makeSafeFileName(input: string, extension: string): string {
  const cleaned = input.trim().replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-');
  return `${cleaned || 'easy-note'}.${extension}`;
}

function pointsToAttribute(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function FormulaView({ latex, fontSize, color }: { latex: string; fontSize: number; color: string }) {
  const markup = useMemo(
    () =>
      katex.renderToString(latex || '\\text{Formula}', {
        displayMode: true,
        throwOnError: false,
        strict: 'ignore',
        output: 'htmlAndMathml'
      }),
    [latex]
  );

  return (
    <div
      className="formula-render"
      style={{ fontSize, color }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

export default function App() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [documentData, setDocumentData] = useState<NoteDocument>(() => loadInitialDocument());
  const [history, setHistory] = useState<NoteDocument[]>([]);
  const [future, setFuture] = useState<NoteDocument[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textStyle, setTextStyle] = useState<TextStyle>({
    fontFamily: 'Inter',
    fontSize: 24,
    color: '#1f2a2a',
    fontWeight: 400
  });
  const [penStyle, setPenStyle] = useState<PenStyle>({
    color: '#006d77',
    size: 5
  });
  const [formulaDraft, setFormulaDraft] = useState('\\int_a^b f(x)\\,dx');
  const [activeStroke, setActiveStroke] = useState<Point[] | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState('Ready');

  const currentPage = useMemo(() => {
    return (
      documentData.pages.find((page) => page.id === documentData.currentPageId) ??
      documentData.pages[0]
    );
  }, [documentData]);

  const selectedElement = useMemo(() => {
    return currentPage?.elements.find((element) => element.id === selectedId) ?? null;
  }, [currentPage, selectedId]);

  const rememberCurrentDocument = useCallback(() => {
    setHistory((items) => [...items.slice(-79), documentData]);
    setFuture([]);
  }, [documentData]);

  const applyDocument = useCallback(
    (updater: (current: NoteDocument) => NoteDocument, remember = true) => {
      setDocumentData((current) => {
        const next = touch(updater(current));
        if (remember) {
          setHistory((items) => [...items.slice(-79), current]);
          setFuture([]);
        }
        return next;
      });
    },
    []
  );

  const updateCurrentPage = useCallback(
    (updater: (page: NotePage) => NotePage, remember = true) => {
      applyDocument(
        (current) => ({
          ...current,
          pages: current.pages.map((page) =>
            page.id === current.currentPageId ? updater(page) : page
          )
        }),
        remember
      );
    },
    [applyDocument]
  );

  const updateElement = useCallback(
    (elementId: string, updater: (element: NoteElement) => NoteElement, remember = true) => {
      updateCurrentPage(
        (page) => ({
          ...page,
          elements: page.elements.map((element) =>
            element.id === elementId ? updater(element) : element
          )
        }),
        remember
      );
    },
    [updateCurrentPage]
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documentData));
  }, [documentData]);

  useEffect(() => {
    if (!selectedElement) {
      return;
    }

    if (selectedElement.type === 'text') {
      setTextStyle({
        fontFamily: selectedElement.fontFamily,
        fontSize: selectedElement.fontSize,
        color: selectedElement.color,
        fontWeight: selectedElement.fontWeight
      });
    }

    if (selectedElement.type === 'formula') {
      setFormulaDraft(selectedElement.latex);
    }
  }, [selectedElement]);

  const relativePoint = useCallback((event: React.PointerEvent | PointerEvent): Point => {
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }
    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height)
    };
  }, []);

  const addText = useCallback(
    (point: Point) => {
      const element: TextElement = {
        id: createId('text'),
        type: 'text',
        x: clamp(point.x, 24, currentPage.width - 300),
        y: clamp(point.y, 24, currentPage.height - 150),
        width: 300,
        height: 130,
        content: 'New note',
        ...textStyle
      };
      updateCurrentPage((page) => ({ ...page, elements: [...page.elements, element] }));
      setSelectedId(element.id);
      setTool('select');
    },
    [currentPage.height, currentPage.width, textStyle, updateCurrentPage]
  );

  const addFormula = useCallback(
    (point: Point) => {
      const element: FormulaElement = {
        id: createId('formula'),
        type: 'formula',
        x: clamp(point.x, 24, currentPage.width - 360),
        y: clamp(point.y, 24, currentPage.height - 120),
        width: 360,
        height: 110,
        latex: formulaDraft,
        fontSize: 22,
        color: textStyle.color
      };
      updateCurrentPage((page) => ({ ...page, elements: [...page.elements, element] }));
      setSelectedId(element.id);
      setTool('select');
    },
    [currentPage.height, currentPage.width, formulaDraft, textStyle.color, updateCurrentPage]
  );

  const addImage = useCallback(
    (dataUrl: string, alt: string) => {
      const element: ImageElement = {
        id: createId('image'),
        type: 'image',
        x: 92,
        y: 88,
        width: 360,
        height: 240,
        src: dataUrl,
        alt
      };
      updateCurrentPage((page) => ({ ...page, elements: [...page.elements, element] }));
      setSelectedId(element.id);
      setTool('select');
      setStatus('Image added');
    },
    [updateCurrentPage]
  );

  const eraseAt = useCallback(
    (point: Point) => {
      updateCurrentPage(
        (page) => ({
          ...page,
          elements: page.elements.filter((element) => {
            if (element.type !== 'ink') {
              return true;
            }
            return distanceToStroke(point, element) > Math.max(12, penStyle.size * 2.2);
          })
        }),
        false
      );
    },
    [penStyle.size, updateCurrentPage]
  );

  const handlePagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = relativePoint(event);

    if (tool === 'select') {
      setSelectedId(null);
      return;
    }

    if (tool === 'text') {
      addText(point);
      return;
    }

    if (tool === 'formula') {
      addFormula(point);
      return;
    }

    if (tool === 'pen') {
      event.currentTarget.setPointerCapture(event.pointerId);
      rememberCurrentDocument();
      setActiveStroke([point]);
      return;
    }

    if (tool === 'eraser') {
      event.currentTarget.setPointerCapture(event.pointerId);
      rememberCurrentDocument();
      eraseAt(point);
    }
  };

  const handlePagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool === 'pen' && activeStroke) {
      const point = relativePoint(event);
      setActiveStroke((points) => (points ? [...points, point] : points));
    }

    if (tool === 'eraser' && event.buttons === 1) {
      eraseAt(relativePoint(event));
    }
  };

  const handlePagePointerUp = () => {
    if (tool === 'pen' && activeStroke && activeStroke.length > 1) {
      const element: InkElement = {
        id: createId('ink'),
        type: 'ink',
        x: 0,
        y: 0,
        width: currentPage.width,
        height: currentPage.height,
        points: activeStroke,
        color: penStyle.color,
        size: penStyle.size
      };
      updateCurrentPage((page) => ({ ...page, elements: [...page.elements, element] }), false);
    }
    setActiveStroke(null);
  };

  const handleElementPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    element: NoteElement
  ) => {
    if (tool === 'select') {
      event.stopPropagation();
      setSelectedId(element.id);
    }
  };

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, element: NoteElement) => {
    event.preventDefault();
    event.stopPropagation();
    rememberCurrentDocument();
    setSelectedId(element.id);
    setDragState({
      elementId: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: element.x,
      startY: element.y
    });
  };

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const handleMove = (event: PointerEvent) => {
      const dx = event.clientX - dragState.startClientX;
      const dy = event.clientY - dragState.startClientY;
      updateElement(
        dragState.elementId,
        (element) => ({
          ...element,
          x: clamp(dragState.startX + dx, 0, currentPage.width - element.width),
          y: clamp(dragState.startY + dy, 0, currentPage.height - element.height)
        }),
        false
      );
    };

    const handleUp = () => setDragState(null);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [currentPage.height, currentPage.width, dragState, updateElement]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile();

      if (!file) {
        return;
      }

      event.preventDefault();
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        if (typeof reader.result === 'string') {
          addImage(reader.result, file.name || 'pasted-image');
        }
      });
      reader.readAsDataURL(file);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addImage]);

  const undo = () => {
    if (history.length === 0) {
      return;
    }
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [documentData, ...items].slice(0, 80));
    setDocumentData(previous);
    setSelectedId(null);
  };

  const redo = () => {
    if (future.length === 0) {
      return;
    }
    const next = future[0];
    setFuture((items) => items.slice(1));
    setHistory((items) => [...items.slice(-79), documentData]);
    setDocumentData(next);
    setSelectedId(null);
  };

  const deleteSelected = () => {
    if (!selectedId) {
      return;
    }
    updateCurrentPage((page) => ({
      ...page,
      elements: page.elements.filter((element) => element.id !== selectedId)
    }));
    setSelectedId(null);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT';

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }

      if (!isEditing && (event.key === 'Delete' || event.key === 'Backspace')) {
        deleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const importImage = async () => {
    const result = await window.easyNote.openImage();
    if (result) {
      addImage(result.dataUrl, result.name);
    }
  };

  const addPage = () => {
    applyDocument((current) => {
      const page = createPage(current.pages.length + 1);
      return {
        ...current,
        pages: [...current.pages, page],
        currentPageId: page.id
      };
    });
    setSelectedId(null);
  };

  const setCurrentPage = (pageId: string) => {
    applyDocument(
      (current) => ({
        ...current,
        currentPageId: pageId
      }),
      false
    );
    setSelectedId(null);
  };

  const saveDocument = async () => {
    const saved = await window.easyNote.saveDocument(documentData);
    setStatus(saved ? 'Document saved' : 'Save canceled');
  };

  const openDocument = async () => {
    const opened = await window.easyNote.openDocument();
    if (opened) {
      setDocumentData(touch(opened));
      setHistory([]);
      setFuture([]);
      setSelectedId(null);
      setStatus('Document opened');
    }
  };

  const capturePage = async (): Promise<string> => {
    if (!pageRef.current) {
      throw new Error('Page is not ready.');
    }
    setSelectedId(null);
    setIsExporting(true);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await document.fonts?.ready;
    try {
      return await toJpeg(pageRef.current, {
        cacheBust: true,
        quality: 0.96,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportJpg = async () => {
    try {
      const dataUrl = await capturePage();
      const saved = await window.easyNote.saveDataUrl({
        dataUrl,
        defaultName: makeSafeFileName(currentPage.title, 'jpg'),
        kind: 'jpg'
      });
      setStatus(saved ? 'JPG exported' : 'JPG export canceled');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'JPG export failed');
    }
  };

  const exportPdf = async () => {
    try {
      const dataUrl = await capturePage();
      const pdf = new jsPDF({
        orientation: currentPage.width >= currentPage.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [currentPage.width, currentPage.height]
      });
      pdf.addImage(dataUrl, 'JPEG', 0, 0, currentPage.width, currentPage.height);
      const pdfDataUrl = pdf.output('datauristring');
      const saved = await window.easyNote.saveDataUrl({
        dataUrl: pdfDataUrl,
        defaultName: makeSafeFileName(currentPage.title, 'pdf'),
        kind: 'pdf'
      });
      setStatus(saved ? 'PDF exported' : 'PDF export canceled');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'PDF export failed');
    }
  };

  const patchTextStyle = (patch: Partial<TextStyle>) => {
    const nextStyle = { ...textStyle, ...patch };
    setTextStyle(nextStyle);
    if (selectedElement?.type === 'text') {
      updateElement(selectedElement.id, (element) => ({ ...element, ...patch }) as TextElement);
    }
  };

  const patchFormula = (patch: Partial<FormulaElement>) => {
    if (selectedElement?.type !== 'formula') {
      return;
    }
    updateElement(selectedElement.id, (element) => ({ ...element, ...patch }) as FormulaElement);
  };

  const patchSelectedBox = (patch: Partial<Pick<NoteElement, 'width' | 'height'>>) => {
    if (!selectedElement) {
      return;
    }
    updateElement(selectedElement.id, (element) => ({
      ...element,
      ...patch
    }));
  };

  const renderElement = (element: NoteElement) => {
    if (element.type === 'ink') {
      return null;
    }

    return (
      <div
        key={element.id}
        className={`note-element note-element-${element.type} ${
          selectedId === element.id ? 'is-selected' : ''
        }`}
        style={{
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height
        }}
        onPointerDown={(event) => handleElementPointerDown(event, element)}
      >
        {selectedId === element.id && !isExporting ? (
          <button
            className="move-handle"
            title="Move"
            type="button"
            onPointerDown={(event) => startDrag(event, element)}
          >
            <Move size={14} />
          </button>
        ) : null}

        {element.type === 'text' ? (
          <textarea
            className="text-surface"
            value={element.content}
            style={{
              fontFamily: element.fontFamily,
              fontSize: element.fontSize,
              color: element.color,
              fontWeight: element.fontWeight
            }}
            onChange={(event) =>
              updateElement(
                element.id,
                (current) => ({ ...current, content: event.target.value }) as TextElement
              )
            }
            onFocus={() => setSelectedId(element.id)}
            spellCheck={false}
          />
        ) : null}

        {element.type === 'image' ? (
          <img className="image-surface" src={element.src} alt={element.alt} draggable={false} />
        ) : null}

        {element.type === 'formula' ? (
          <FormulaView latex={element.latex} fontSize={element.fontSize} color={element.color} />
        ) : null}
      </div>
    );
  };

  if (!currentPage) {
    return null;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">EN</div>
          <div>
            <strong>Easy Note</strong>
            <span>{status}</span>
          </div>
        </div>

        <div className="toolbar-group" aria-label="Tools">
          <button
            className={`icon-button ${tool === 'select' ? 'is-active' : ''}`}
            title="Select"
            type="button"
            onClick={() => setTool('select')}
          >
            <MousePointer2 size={18} />
          </button>
          <button
            className={`icon-button ${tool === 'text' ? 'is-active' : ''}`}
            title="Text"
            type="button"
            onClick={() => setTool('text')}
          >
            <Type size={18} />
          </button>
          <button
            className={`icon-button ${tool === 'pen' ? 'is-active' : ''}`}
            title="Pen"
            type="button"
            onClick={() => setTool('pen')}
          >
            <PenLine size={18} />
          </button>
          <button
            className={`icon-button ${tool === 'eraser' ? 'is-active' : ''}`}
            title="Eraser"
            type="button"
            onClick={() => setTool('eraser')}
          >
            <Eraser size={18} />
          </button>
          <button
            className={`icon-button ${tool === 'formula' ? 'is-active' : ''}`}
            title="Formula"
            type="button"
            onClick={() => setTool('formula')}
          >
            <Sigma size={18} />
          </button>
          <button className="icon-button" title="Image" type="button" onClick={importImage}>
            <ImagePlus size={18} />
          </button>
        </div>

        <div className="toolbar-group" aria-label="History">
          <button className="icon-button" title="Undo" type="button" onClick={undo}>
            <Undo2 size={18} />
          </button>
          <button className="icon-button" title="Redo" type="button" onClick={redo}>
            <Redo2 size={18} />
          </button>
        </div>

        <div className="toolbar-group toolbar-export" aria-label="Files">
          <button className="icon-button" title="Open JSON" type="button" onClick={openDocument}>
            <FolderOpen size={18} />
          </button>
          <button className="icon-button" title="Save JSON" type="button" onClick={saveDocument}>
            <Save size={18} />
          </button>
          <button className="text-button" type="button" onClick={exportJpg}>
            <Download size={17} />
            JPG
          </button>
          <button className="text-button" type="button" onClick={exportPdf}>
            <FileDown size={17} />
            PDF
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="page-list">
          <div className="panel-heading">
            <span>Pages</span>
            <button className="icon-button compact" title="Add page" type="button" onClick={addPage}>
              <Plus size={16} />
            </button>
          </div>
          <div className="pages">
            {documentData.pages.map((page, index) => (
              <button
                key={page.id}
                className={`page-tab ${page.id === currentPage.id ? 'is-active' : ''}`}
                type="button"
                onClick={() => setCurrentPage(page.id)}
              >
                <span>{index + 1}</span>
                {page.title}
              </button>
            ))}
          </div>
        </aside>

        <section className="canvas-wrap">
          <div
            ref={pageRef}
            className={`note-page ${isExporting ? 'is-exporting' : ''}`}
            style={{ width: currentPage.width, height: currentPage.height }}
            onPointerDown={handlePagePointerDown}
            onPointerMove={handlePagePointerMove}
            onPointerUp={handlePagePointerUp}
          >
            <svg
              className="ink-layer"
              viewBox={`0 0 ${currentPage.width} ${currentPage.height}`}
              aria-hidden="true"
            >
              {currentPage.elements
                .filter((element): element is InkElement => element.type === 'ink')
                .map((stroke) => (
                  <polyline
                    key={stroke.id}
                    points={pointsToAttribute(stroke.points)}
                    fill="none"
                    stroke={stroke.color}
                    strokeWidth={stroke.size}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              {activeStroke ? (
                <polyline
                  points={pointsToAttribute(activeStroke)}
                  fill="none"
                  stroke={penStyle.color}
                  strokeWidth={penStyle.size}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </svg>

            {currentPage.elements.map(renderElement)}
          </div>
        </section>

        <aside className="inspector">
          <div className="panel-heading">
            <span>Inspector</span>
            {selectedElement ? (
              <button className="plain-button" type="button" onClick={deleteSelected}>
                Delete
              </button>
            ) : null}
          </div>

          <label className="field">
            <span>Document title</span>
            <input
              value={documentData.title}
              onChange={(event) =>
                applyDocument((current) => ({ ...current, title: event.target.value }), false)
              }
            />
          </label>

          <label className="field">
            <span>Page title</span>
            <input
              value={currentPage.title}
              onChange={(event) =>
                updateCurrentPage(
                  (page) => ({ ...page, title: event.target.value }),
                  false
                )
              }
            />
          </label>

          <div className="section-title">Text style</div>
          <label className="field">
            <span>Font</span>
            <select
              value={textStyle.fontFamily}
              onChange={(event) => patchTextStyle({ fontFamily: event.target.value })}
            >
              {fontFamilies.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </label>
          <label className="field split">
            <span>Size</span>
            <input
              type="number"
              min={10}
              max={96}
              value={textStyle.fontSize}
              onChange={(event) => patchTextStyle({ fontSize: Number(event.target.value) })}
            />
          </label>
          <label className="field split">
            <span>Weight</span>
            <button
              className={`toggle-button ${textStyle.fontWeight >= 700 ? 'is-active' : ''}`}
              type="button"
              onClick={() =>
                patchTextStyle({ fontWeight: textStyle.fontWeight >= 700 ? 400 : 700 })
              }
            >
              <Bold size={16} />
              Bold
            </button>
          </label>
          <div className="swatches">
            {colorSwatches.map((color) => (
              <button
                key={color}
                className={`swatch ${textStyle.color === color ? 'is-active' : ''}`}
                style={{ backgroundColor: color }}
                title={color}
                type="button"
                onClick={() => patchTextStyle({ color })}
              />
            ))}
            <input
              className="color-input"
              title="Text color"
              type="color"
              value={textStyle.color}
              onChange={(event) => patchTextStyle({ color: event.target.value })}
            />
          </div>

          <div className="section-title">Pen</div>
          <label className="field split">
            <span>Stroke</span>
            <input
              type="range"
              min={2}
              max={24}
              value={penStyle.size}
              onChange={(event) =>
                setPenStyle((current) => ({ ...current, size: Number(event.target.value) }))
              }
            />
          </label>
          <div className="swatches">
            {colorSwatches.map((color) => (
              <button
                key={color}
                className={`swatch ${penStyle.color === color ? 'is-active' : ''}`}
                style={{ backgroundColor: color }}
                title={color}
                type="button"
                onClick={() => setPenStyle((current) => ({ ...current, color }))}
              />
            ))}
            <input
              className="color-input"
              title="Pen color"
              type="color"
              value={penStyle.color}
              onChange={(event) =>
                setPenStyle((current) => ({ ...current, color: event.target.value }))
              }
            />
          </div>

          {selectedElement?.type === 'formula' ? (
            <>
              <div className="section-title">Formula</div>
              <label className="field">
                <span>LaTeX</span>
                <textarea
                  value={formulaDraft}
                  onChange={(event) => {
                    setFormulaDraft(event.target.value);
                    patchFormula({ latex: event.target.value });
                  }}
                />
              </label>
              <label className="field split">
                <span>Size</span>
                <input
                  type="number"
                  min={12}
                  max={80}
                  value={selectedElement.fontSize}
                  onChange={(event) => patchFormula({ fontSize: Number(event.target.value) })}
                />
              </label>
            </>
          ) : null}

          {selectedElement && selectedElement.type !== 'ink' ? (
            <>
              <div className="section-title">Box</div>
              <label className="field split">
                <span>Width</span>
                <input
                  type="number"
                  min={60}
                  max={currentPage.width}
                  value={Math.round(selectedElement.width)}
                  onChange={(event) =>
                    patchSelectedBox({ width: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field split">
                <span>Height</span>
                <input
                  type="number"
                  min={40}
                  max={currentPage.height}
                  value={Math.round(selectedElement.height)}
                  onChange={(event) =>
                    patchSelectedBox({ height: Number(event.target.value) })
                  }
                />
              </label>
            </>
          ) : (
            <p className="empty-note">Choose a tool or select an element to edit its properties.</p>
          )}
        </aside>
      </section>
    </main>
  );
}
