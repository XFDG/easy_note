export type Tool = 'select' | 'text' | 'pen' | 'eraser' | 'formula';

export type Point = {
  x: number;
  y: number;
};

export type BaseElement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TextElement = BaseElement & {
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: number;
};

export type ImageElement = BaseElement & {
  type: 'image';
  src: string;
  alt: string;
};

export type InkElement = BaseElement & {
  type: 'ink';
  points: Point[];
  color: string;
  size: number;
};

export type FormulaElement = BaseElement & {
  type: 'formula';
  latex: string;
  fontSize: number;
  color: string;
};

export type NoteElement = TextElement | ImageElement | InkElement | FormulaElement;

export type NotePage = {
  id: string;
  title: string;
  width: number;
  height: number;
  elements: NoteElement[];
};

export type NoteDocument = {
  title: string;
  pages: NotePage[];
  currentPageId: string;
  updatedAt: string;
};

export type ImageImportResult = {
  name: string;
  dataUrl: string;
};

export type EasyNoteApi = {
  openImage: () => Promise<ImageImportResult | null>;
  saveDocument: (documentData: NoteDocument) => Promise<boolean>;
  openDocument: () => Promise<NoteDocument | null>;
  saveDataUrl: (payload: {
    dataUrl: string;
    defaultName: string;
    kind: 'jpg' | 'pdf';
  }) => Promise<boolean>;
};

declare global {
  interface Window {
    easyNote: EasyNoteApi;
  }
}
