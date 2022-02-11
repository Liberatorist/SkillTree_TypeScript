﻿import { ISkillNodeRenderer } from "./types/ISkillNodeRenderer";
import { SkillNode, SkillNodeStates } from './SkillNode'
import * as PIXI from "pixi.js";
import { SkillTreeEvents } from "./SkillTreeEvents";
import { utils } from "../app/utils";
import { ISpritesheetData, Sprite } from "pixi.js";

export declare type Source = "Base" | "Compare";

export class PIXISkillNodeRenderer implements ISkillNodeRenderer {
    Initialized = false;
    private SkillSprites: { [id: string]: Array<ISpriteSheet> };
    private SkillSpritesCompare: { [id: string]: Array<ISpriteSheet> };
    private ZoomLevel: number;

    private NodeTooltips: { [id: string]: PIXI.Container | undefined };
    private NodeSpritesheets: { [id: string]: PIXI.Spritesheet | undefined };

    constructor(skillSprites: { [id: string]: Array<ISpriteSheet> }, skillSpritesCompare: { [id: string]: Array<ISpriteSheet> } | undefined, zoomLevel = 3) {
        this.SkillSprites = skillSprites;
        this.SkillSpritesCompare = skillSpritesCompare || {};
        this.ZoomLevel = zoomLevel;

        this.NodeTooltips = {};
        this.NodeSpritesheets = {};
    }

    async Initialize(): Promise<boolean> {
        if (this.Initialized) {
            return true;
        }

        const promise = new Promise<boolean>(resolve => {
            this.LoadAssets([this.SkillSprites, this.SkillSpritesCompare]).then(() => resolve(true));
        })
        promise.then(() => this.Initialized = true);
        return promise;
    }

    private LoadAssets = (data: ({ [id: string]: Array<ISpriteSheet> })[]): Promise<boolean[]> => {
        for (const i in data) {
            const dict = data[i];
            for (const key in dict) {
                const sheet = dict[key][this.ZoomLevel];
                const texture = PIXI.Texture.from(sheet.filename.replace("PassiveSkillScreen", "").replace("https://web.poecdn.com/image/passive-skill/", ""));
                const source: Source = i === "0" ? "Base" : "Compare";
                const spritesheetData = this.getSpritesheetData(sheet, key, source);
                this.NodeSpritesheets[`${source}/${key}`] = new PIXI.Spritesheet(texture.baseTexture, spritesheetData)
            }
        }

        const promises = new Array<Promise<boolean>>();
        for (const key in this.NodeSpritesheets) {
            if (this.NodeSpritesheets[key] !== undefined) {
                promises.push(new Promise<boolean>(resolve => this.NodeSpritesheets[key]!.parse(() => resolve(true))))
            }
        }
        return Promise.all(promises);
    }

    private getSpritesheetData = (spriteSheet: ISpriteSheet, key: string, source: Source): PIXI.ISpritesheetData => {
        let data: ISpritesheetData = {
            frames: {},
            animations: undefined,
            meta: {
                scale: "1"
            }
        };

        for (const i in spriteSheet.coords) {
            const coord = spriteSheet.coords[i];
            data.frames[`${source}/${key}/${i}`] = {
                frame: coord,
                rotated: false,
                trimmed: false,
                spriteSourceSize: {
                    x: 0,
                    y: 0
                },
                sourceSize: {
                    w: coord.w,
                    h: coord.h
                }
            };
        }

        return data;
    }

    public GetNodeSize = (node: SkillNode, source: Source = "Base"): { width: number; height: number } | null => {
        const icon = node.GetIcon();
        if (icon === "") {
            return null;
        }

        const spriteSheetKey = this.getSpriteSheetKey(node);
        const texture = this.getSpritesheetTexture(source, spriteSheetKey, icon);
        return texture ? { width: texture.width, height: texture.height } : null;
    }

    public CreateFrame = (node: SkillNode, others: SkillNode[]): PIXI.Sprite | null => {
        const asset = node.GetFrameAssetKey(others);
        if (asset === null) {
            return null;
        }

        const texture = PIXI.Texture.from(asset)
        const frame = PIXI.Sprite.from(texture);
        frame.position.set(node.x, node.y);
        frame.anchor.set(.5);
        frame.hitArea = new PIXI.Circle(0, 0, Math.max(frame.texture.width, frame.texture.height) / 2);
        if (node.is(SkillNodeStates.Active | SkillNodeStates.Hovered)
            || (node.is(SkillNodeStates.Active | SkillNodeStates.Pathing) && (node.isMultipleChoice || node.isMultipleChoiceOption))) {
            frame.tint = 0xFF0000;
        }

        this.RebindNodeEvents(node, frame);
        return frame;
    }

    public CreateIcon = (node: SkillNode, source: Source = "Base"): PIXI.Sprite | null => {
        if (node.isAscendancyStart) {
            return null
        }

        const icon = node.GetIcon();
        if (icon === "") {
            return null;
        }

        const spriteSheetKey = this.getSpriteSheetKey(node);
        const texture = this.getSpritesheetTexture(source, spriteSheetKey, icon);
        if (texture === null) {
            return null;
        }

        const nodeSprite = PIXI.Sprite.from(texture);
        nodeSprite.position.set(node.x, node.y);
        nodeSprite.anchor.set(.5);

        //FIXME: This should really be anything that doesn't get a frame, but that is only Mastery nodes currently
        if (node.isMastery) {
            nodeSprite.hitArea = new PIXI.Circle(0, 0, Math.max(nodeSprite.texture.width, nodeSprite.texture.height) / 2);
            this.RebindNodeEvents(node, nodeSprite);
        } else {
            nodeSprite.interactive = false;
            nodeSprite.interactive = false;
        }

        return nodeSprite;
    }

    public CreateIconEffect = (node: SkillNode, source: Source = "Base"): PIXI.Sprite | null => {
        if (node.activeEffectImage === "" || !node.is(SkillNodeStates.Active)) {
            return null;
        }

        const effectTexture = this.getSpritesheetTexture(source, "masteryActiveEffect", node.activeEffectImage);
        if (effectTexture === null) {
            return null;
        }

        const effectSprite = PIXI.Sprite.from(effectTexture);
        effectSprite.position.set(node.x, node.y);
        effectSprite.anchor.set(.5);
        effectSprite.interactive = false;
        effectSprite.interactiveChildren = false;
        return effectSprite;
    }

    private getSpriteSheetKey = (node: SkillNode): string => {
        const drawType = node.is(SkillNodeStates.Active) ? "Active" : "Inactive";
        if (node.isKeystone) {
            return `keystone${drawType}`;
        } else if (node.isNotable) {
            return `notable${drawType}`;
        } else if (node.isMastery) {
            if (node.activeEffectImage !== "") {
                if (node.is(SkillNodeStates.Active) || node.is(SkillNodeStates.Hovered)) {
                    return "masteryActiveSelected";
                } else if (node.is(SkillNodeStates.Hovered) || node.is(SkillNodeStates.Pathing)) {
                    return "masteryConnected";
                } else {
                    return "masteryInactive";
                }
            } else if (node.is(SkillNodeStates.Active) || node.is(SkillNodeStates.Hovered)) {
                return "masteryActive";
            } else {
                return "mastery";
            }
        } else {
            return `normal${drawType}`;
        }
    }

    private getSpritesheetTexture = (source: Source, spriteSheetKey: string, icon: string): PIXI.Texture | null => {
        const pixiSpritesheet = this.NodeSpritesheets[`${source}/${spriteSheetKey}`];
        if (pixiSpritesheet !== undefined) {
            const texture = pixiSpritesheet.textures[`${source}/${spriteSheetKey}/${icon}`];
            if (texture !== undefined) {
                return texture
            }
        }

        console.warn(`Texture not found for ${source}/${spriteSheetKey}/${icon}`);
        return null;
    }

    private RebindNodeEvents = (node: SkillNode, sprite: PIXI.Sprite) => {
        sprite.removeAllListeners();
        sprite.name = `${node.GetId()}`;

        if (SkillTreeEvents.events["node"] !== undefined) {
            sprite.interactive = true;

            for (const event in SkillTreeEvents.events["node"]) {
                sprite.on(event, (interaction: PIXI.InteractionEvent) => {
                    if ((event === "click" || event === "tap") && (interaction.data.originalEvent.shiftKey || interaction.data.originalEvent.ctrlKey || interaction.data.originalEvent.altKey)) {
                        return;
                    }

                    SkillTreeEvents.fire("node", event, node);
                });
            }
        }
    }

    public CreateHighlight = (node: SkillNode, color: number | undefined = undefined, source: Source = "Base"): PIXI.Graphics | null => {
        if ((!node.is(SkillNodeStates.Highlighted)) && color === undefined) {
            return null;
        }
        const size = this.GetNodeSize(node, source);
        if (size === null) {
            return null;
        }

        if (color === undefined) {
            color = 0xFFA500;
        }

        const graphic = new PIXI.Graphics();
        graphic.beginFill(0x000000, 0);
        graphic.lineStyle(5, color);
        graphic.drawCircle(0, 0, Math.max(size.width, size.height) * .85 * (node.isMastery ? .5 : 1));
        graphic.endFill();
        graphic.position.set(node.x, node.y);

        graphic.interactive = false;
        graphic.interactiveChildren = false;
        graphic.containerUpdateTransform = () => { };

        return graphic;
    }

    public CreateTooltip = (node: SkillNode, source: Source) => {
        let tooltip: PIXI.Container | undefined = this.NodeTooltips[`${node.GetId()}_${source}`];

        if (tooltip === undefined) {
            let title: PIXI.Text | null = node.name.length > 0 ? new PIXI.Text(`${node.name} [${node.id}]`, { fill: 0xFFFFFF, fontSize: 18 }) : null;
            let stats: PIXI.Text | null = node.stats.filter(utils.NotNullOrWhiteSpace).length > 0 ? new PIXI.Text(`\n${node.stats.filter(utils.NotNullOrWhiteSpace).join('\n')}`, { fill: 0xFFFFFF, fontSize: 14 }) : null;
            let flavour: PIXI.Text | null = node.flavourText.filter(utils.NotNullOrWhiteSpace).length > 0 ? new PIXI.Text(`\n${node.flavourText.filter(utils.NotNullOrWhiteSpace).join('\n')}`, { fill: 0xAF6025, fontSize: 14 }) : null;
            let reminder: PIXI.Text | null = node.reminderText.filter(utils.NotNullOrWhiteSpace).length > 0 ? new PIXI.Text(`\n${node.reminderText.filter(utils.NotNullOrWhiteSpace).join('\n')}`, { fill: 0x808080, fontSize: 14 }) : null;

            tooltip = new PIXI.Container();
            tooltip.position.set(0, 0);
            let height = 0;
            if (title !== null) {
                tooltip.addChild(title);
                title.position.set(0, height);
                height += title.height;
            }

            if (stats !== null) {
                tooltip.addChild(stats);
                stats.position.set(0, height);
                height += stats.height;
            }

            if (flavour !== null) {
                tooltip.addChild(flavour);
                flavour.position.set(0, height);
                height += flavour.height;
            }

            if (reminder !== null) {
                tooltip.addChild(reminder);
                reminder.position.set(0, height);
                height += reminder.height;
            }

            tooltip.interactive = false;
            tooltip.interactiveChildren = false;
            tooltip.containerUpdateTransform = () => { };
            this.NodeTooltips[`${node.GetId()}_${source}`] = tooltip;
        }

        return tooltip;
    }

    public DestroyTooltip = (node: SkillNode, source: Source) => {
        const tooltip: PIXI.Container | undefined = this.NodeTooltips[`${node.GetId()}_${source}`];
        if (tooltip === undefined) {
            return;
        }

        tooltip.destroy({ children: true, texture: true, baseTexture: true });
        this.NodeTooltips[`${node.GetId()}_${source}`] = undefined;
    }
}