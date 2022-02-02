﻿import { ISkillNodeRenderer } from "./ISkillNodeRenderer";
import { SkillNode } from "../SkillNode";

interface ISkillTreeRenderer {
    SkillNodeRenderer: ISkillNodeRenderer;
    Initialized: boolean;
    Initialize(): Promise<boolean>;

    RenderActive(): void;
    RenderBase(): void;
    RenderCharacterStartsActive(): void;
    RenderHighlight(): void;
    StartRenderHover(skillNode: SkillNode): void;
    StopRenderHover(skillNode: SkillNode): void;
    CreateScreenshot(mimeType: "image/jpeg" | "image/webp"): string;
}