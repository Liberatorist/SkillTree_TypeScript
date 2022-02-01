﻿import { ISkillTreeRenderer } from "./types/ISkillTreeRenderer";
import { SkillTreeData } from './SkillTreeData';
import Viewport = require("pixi-viewport");
import PIXI = require("pixi.js");
import { utils } from "../app/utils";
import { SkillTreeEvents } from "./SkillTreeEvents";
import { SkillNodeStates, SkillNode } from "./SkillNode";
import { PIXISkillNodeRenderer } from "./PIXISkillNodeRenderer";
import { SkillTreeAlternate } from "./SkillTreeAlternate";

export enum RenderLayers {
    BackgroundColor = 0,
    Background = 1,
    BackgroundActive = 2,
    Connections = 3,
    SkillIconsActiveEffects = 4,
    ConnectionsActive = 5,
    ConnectionsPathing = 6,
    SkillIcons = 7,
    SkillIconsPathing = 8,
    SkillIconsActive = 9,
    CharacterStarts = 10,
    CharacterStartsActive = 11,
    JewelSocketActive = 12,
    JewelSocketHighlights = 13,
    SkillIconsCompare = 14,
    Highlights = 15,
    NodeMoveCompare = 16,
    Tooltip = 17,
    TooltipCompare = 18
}

export class PIXISkillTreeRenderer implements ISkillTreeRenderer {
    Initialized = false;
    SkillNodeRenderer: PIXISkillNodeRenderer;
    private updateHover = false;
    private pixi: PIXI.Application;
    private viewport: Viewport.Viewport;
    private skillTreeData: SkillTreeData;
    private skillTreeDataCompare: SkillTreeData | undefined;
    private skillTreeAlternate: SkillTreeAlternate;
    LayerContainers: { [layer in RenderLayers]: PIXI.Container } = {
        [RenderLayers.BackgroundColor]: new PIXI.Container(),
        [RenderLayers.Background]: new PIXI.Container(),
        [RenderLayers.BackgroundActive]: new PIXI.Container(),
        [RenderLayers.Connections]: new PIXI.Container(),
        [RenderLayers.SkillIconsActiveEffects]: new PIXI.Container(),
        [RenderLayers.ConnectionsActive]: new PIXI.Container(),
        [RenderLayers.ConnectionsPathing]: new PIXI.Container(),
        [RenderLayers.SkillIcons]: new PIXI.Container(),
        [RenderLayers.SkillIconsPathing]: new PIXI.Container(),
        [RenderLayers.SkillIconsActive]: new PIXI.Container(),
        [RenderLayers.CharacterStarts]: new PIXI.Container(),
        [RenderLayers.CharacterStartsActive]: new PIXI.Container(),
        [RenderLayers.JewelSocketActive]: new PIXI.Container(),
        [RenderLayers.JewelSocketHighlights]: new PIXI.Container(),
        [RenderLayers.SkillIconsCompare]: new PIXI.Container(),
        [RenderLayers.Highlights]: new PIXI.Container(),
        [RenderLayers.NodeMoveCompare]: new PIXI.Container(),
        [RenderLayers.Tooltip]: new PIXI.Container(),
        [RenderLayers.TooltipCompare]: new PIXI.Container(),
    };

    constructor(container: HTMLElement, skillTreeData: SkillTreeData, skillTreeAlternate: SkillTreeAlternate, skillTreeDataCompare: SkillTreeData | undefined) {
        this.pixi = new PIXI.Application({ resizeTo: window, resolution: devicePixelRatio });
        container.appendChild(this.pixi.view);

        PIXI.settings.SORTABLE_CHILDREN = false;
        PIXI.utils.destroyTextureCache();
        PIXI.Loader.shared.reset();

        this.skillTreeData = skillTreeData;
        this.skillTreeDataCompare = skillTreeDataCompare;
        this.skillTreeAlternate = skillTreeAlternate;

        this.SkillNodeRenderer = new PIXISkillNodeRenderer(this.skillTreeData.skillSprites, this.skillTreeAlternate, this.skillTreeDataCompare !== undefined ? this.skillTreeDataCompare.skillSprites : undefined, this.skillTreeData.imageZoomLevels.length - 1);
        SkillTreeEvents.on("skilltree", "hovered-nodes-end", (node: SkillNode) => this.SkillNodeRenderer.DestroyTooltip(node, "Base"));
        SkillTreeEvents.on("skilltree", "hovered-nodes-end", (node: SkillNode) => this.SkillNodeRenderer.DestroyTooltip(node, "Compare"));
        SkillTreeEvents.on("skilltree", "jewel-click-end", this.CreateJewelSocketHightlights);
        SkillTreeEvents.on("skilltree", "faction-node-end", this.UpdateFactionNode);

        const zoomPercent = this.skillTreeData.imageZoomLevels.length > 2 ? this.skillTreeData.imageZoomLevels[1] - this.skillTreeData.imageZoomLevels[0] : .1;
        this.viewport = new Viewport.Viewport({
            screenWidth: this.pixi.screen.width,
            screenHeight: this.pixi.screen.height,
            worldWidth: this.skillTreeData.width * (this.skillTreeData.scale * 1.25),
            worldHeight: this.skillTreeData.height * (this.skillTreeData.scale * 1.25),
            interaction: this.pixi.renderer.plugins.interaction
        });
        this.viewport.drag().wheel({ percent: zoomPercent }).pinch({ percent: zoomPercent * 10 });
        this.viewport.clampZoom({ minWidth: this.skillTreeData.width * (zoomPercent / 8), minHeight: this.skillTreeData.height * (zoomPercent / 8) });
        this.viewport.fitWorld(true);
        this.viewport.zoomPercent(1.726);

        this.viewport.on('drag-start', (data) => SkillTreeEvents.fire("viewport", "drag-start", data.world));
        this.viewport.on('drag-end', (data) => SkillTreeEvents.fire("viewport", "drag-end", data.world));
        this.viewport.on('mouseup', () => SkillTreeEvents.fire("viewport", "mouseup"));
        this.viewport.on('touchend', () => SkillTreeEvents.fire("viewport", "touchend"));
        this.viewport.on('touchcancel', () => SkillTreeEvents.fire("viewport", "touchcancel"));
        this.viewport.on('click', (click) => this.HandleZoomClick(click, zoomPercent * 2));
        this.viewport.on('click', this.HandleShiftClick);
        this.viewport.on('rightclick', (click) => this.HandleZoomClick(click, -zoomPercent * 2));

        this.pixi.stage.addChild(this.viewport);

        window.onresize = () => {
            this.pixi.renderer.resize(window.innerWidth, window.innerHeight);
            this.viewport.resize(this.pixi.renderer.width, this.pixi.renderer.height, this.skillTreeData.width * (this.skillTreeData.scale * 1.25), this.skillTreeData.height * (this.skillTreeData.scale * 1.25));
            this.viewport.clampZoom({ minWidth: this.skillTreeData.width * (zoomPercent / 8), minHeight: this.skillTreeData.height * (zoomPercent / 8) });
        };
    }

    private SetupLayers() {
        this.viewport.removeChildren();

        for (const key in this.LayerContainers) {
            this.viewport.addChild(this.LayerContainers[Number(key) as RenderLayers]);
        }
    }

    private SetLayer(layer: RenderLayers, object: PIXI.Container) {
        this.LayerContainers[layer] = object;

        const current = this.viewport.getChildAt(layer);
        this.viewport.addChild(object);
        this.viewport.swapChildren(current, object);
        this.viewport.removeChild(current);
    }

    private ClearLayer(layer: RenderLayers) {
        this.SetLayer(layer, new PIXI.Container());
    }

    async Initialize(): Promise<boolean> {
        if (this.Initialized) {
            return true;
        }

        await this.LoadAssets([this.skillTreeData, this.skillTreeDataCompare]);
        this.Initialized = true;

        return this.SkillNodeRenderer.Initialize();
    }

    private HandleZoomClick = (click: PIXI.InteractionEvent, zoom: number) => {
        if (!click.data.originalEvent.ctrlKey) {
            return;
        }

        this.viewport.zoomPercent(zoom, false);
    }

    private HandleShiftClick = (click: PIXI.InteractionEvent) => {
        if (!click.data.originalEvent.shiftKey) {
            return;
        }

        const interactiveObject = this.pixi.renderer.plugins.interaction.hitTest(click.data.global, this.viewport.getChildAt(RenderLayers.SkillIcons));
        if (interactiveObject === null || interactiveObject.name === undefined || interactiveObject.name === null || interactiveObject.name === "") {
            return;
        }

        const node = this.skillTreeData.nodes[+interactiveObject.name];
        if (node.isKeystone) {
            return;
        }

        if (node.isJewelSocket) {
            let settings = this.skillTreeData.Build.JewelSettings[node.GetId()];
            if (settings === undefined) {
                settings = { nodeId: node.GetId() } as ISkillTreeAlternateJewelSettings;
            }
            SkillTreeEvents.fire("skilltree", "jewel-click-start", settings);
        } else if (node.faction !== 0) {
            SkillTreeEvents.fire("skilltree", "faction-node-start", { node: node, choices: this.skillTreeAlternate.nodesByPassiveType[node.GetPassiveType()].filter(x => x.faction === node.faction) });
        }
    }

    private UpdateFactionNode = (event: { nodeId: number; alteranteIds: ISkillNodeAlternateState[] }) => {
        const node = this.skillTreeData.nodes[event.nodeId];
        node.alternateIds = event.alteranteIds.length > 0 ? event.alteranteIds : undefined;

        this.CreateJewelSocketHightlights();
    }

    private CreateJewelSocketHightlights = (newSettings: ISkillTreeAlternateJewelSettings | undefined = undefined) => {
        this.ClearLayer(RenderLayers.JewelSocketHighlights);
        const jewelSocketHighlights: PIXI.Container = new PIXI.Container();

        if (newSettings !== undefined && this.skillTreeData.Build.JewelSettings[newSettings.nodeId] === undefined) {
            this.skillTreeData.Build.JewelSettings[newSettings.nodeId] = JSON.parse(JSON.stringify(newSettings));
        }

        const usedNodes: string[] = [];
        for (const i in this.skillTreeData.Build.JewelSettings) {
            let settings = this.skillTreeData.Build.JewelSettings[i];
            if (settings === undefined) {
                continue;
            }

            if (settings.extraData instanceof PIXI.Container) {
                this.pixi.ticker.remove(this.RotateJewelHighlights, settings.extraData);
                jewelSocketHighlights.removeChild(settings.extraData);
                settings.extraData.destroy({ children: true });
                settings.extraData = undefined;
            }

            if (newSettings !== undefined && settings.nodeId === newSettings.nodeId) {
                this.skillTreeData.Build.JewelSettings[newSettings.nodeId] = JSON.parse(JSON.stringify(newSettings)) as ISkillTreeAlternateJewelSettings;
                settings = this.skillTreeData.Build.JewelSettings[newSettings.nodeId];
                if (settings === undefined) {
                    continue;
                }
            }

            if (settings.size !== "None" && settings.extraData === undefined) {
                const node = this.skillTreeData.nodes[settings.nodeId];
                if (node === undefined) {
                    continue;
                }
                const sizes = this.skillTreeData.circles[settings.size];
                const index = this.skillTreeData.imageZoomLevels.length - 1;
                if (index >= sizes.length) {
                    continue;
                }
                const jewelWidth = sizes[index].width;
                const factionCircleName = this.skillTreeAlternate.getJewelCircleNameFromFaction(settings.factionId);
                const sprite1 = PIXI.Sprite.from(`${factionCircleName}JewelCircle1`);
                const sprite2 = PIXI.Sprite.from(`${factionCircleName}JewelCircle${factionCircleName === "" ? 1 : 2}`);
                sprite1.width = sprite1.height = sprite2.width = sprite2.height = jewelWidth;
                sprite1.x = sprite2.x = node.x;
                sprite1.y = sprite2.y = node.y;
                sprite1.anchor.set(.5);
                sprite2.anchor.set(.5);

                const container = new PIXI.Container();
                container.addChild(sprite2);
                container.addChild(sprite1);

                jewelSocketHighlights.addChild(container);
                settings.extraData = container;

                const singleNodes: { [id: number]: ISkillNodeAlternateState[] | undefined } = {};
                if (settings.factionId in this.skillTreeAlternate.alternate_tree_keystones) {
                    const keystoneId = this.skillTreeAlternate.alternate_tree_keystones[settings.factionId][settings.name];
                    singleNodes[4] = [{ id: keystoneId, values: [] } as ISkillNodeAlternateState];
                }

                for (const passiveType in this.skillTreeAlternate.passiveTypes) {
                    if (this.skillTreeAlternate.nodesByPassiveType[+passiveType] === undefined) {
                        continue;
                    }
                    const ns = this.skillTreeAlternate.nodesByPassiveType[+passiveType].filter(x => x.faction === (settings as ISkillTreeAlternateJewelSettings).factionId);
                    if (ns.length === 1) {
                        singleNodes[+passiveType] = [{ id: ns[0].id, values: ns[0].stats.map(x => x.min === x.max ? x.min : `${x.min}-${x.max}`) } as ISkillNodeAlternateState];
                    }
                }

                for (const o of this.skillTreeData.getNodesInRange(node.x, node.y, jewelWidth / 2)) {
                    if (o.isJewelSocket) {
                        continue;
                    }
                    usedNodes.push(o.GetId());
                    o.faction = settings.factionId;

                    if (o.alternateIds !== undefined && o.alternateIds.filter(x => this.skillTreeAlternate.nodes[typeof x === "string" ? x : x.id].faction !== (settings as ISkillTreeAlternateJewelSettings).factionId).length > 0) {
                        o.alternateIds = undefined;
                    }

                    if (o.alternateIds === undefined || o.GetPassiveType() === 4) {
                        o.alternateIds = singleNodes[o.GetPassiveType()];
                    }
                }

                if (settings.extraData instanceof PIXI.Container) {
                    this.pixi.ticker.add(this.RotateJewelHighlights, settings.extraData);
                }
            }
        }

        this.skillTreeData.clearAlternates(usedNodes);

        jewelSocketHighlights.interactive = false;
        jewelSocketHighlights.interactiveChildren = false;
        jewelSocketHighlights.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.JewelSocketHighlights, jewelSocketHighlights);

        this.RenderActive();
        SkillTreeEvents.fire("skilltree", "encode-url");
    }

    private RotateJewelHighlights(delta: number) {
        if (this instanceof PIXI.Container) {
            let rotation = 0.0005;
            for (const sprite of this.children) {
                sprite.rotation += rotation * delta;
                rotation *= -1;
            }
        }
    }

    private LoadAssets = (data: (SkillTreeData | undefined)[]): Promise<boolean> => {
        const filteredData = data.filter(utils.NotUndefined);
        if (filteredData.length <= 0) {
            throw new Error("SkillTreeData has not been defined. Could not load assets.");
        }

        const promise = new Promise<boolean>((resolve) => {
            PIXI.Loader.shared.onComplete.add(() => resolve(true));
            //PIXI.Loader.shared.onError.add(() => reject(false));
        });

        // #region Load Assets
        const addedAssets = new Array<string>();
        for (const i of filteredData) {
            for (const id in i.assets) {
                const asset = i.assets[id];
                if ((asset[i.scale] || asset["1"]) && addedAssets.indexOf(id) < 0) {
                    addedAssets.push(id);
                    PIXI.Loader.shared.add(id.replace("PassiveSkillScreen", ""), `${utils.SKILL_TREES_URI}/${i.patch}/assets/${id}.png`);
                }
            }

            for (const id in i.skillSprites) {
                const sprites = i.skillSprites[id];
                const sprite = sprites[sprites.length - 1];
                const filename = sprite.filename.replace("https://web.poecdn.com/image/passive-skill/", "");
                if (sprite && addedAssets.indexOf(filename) < 0) {
                    addedAssets.push(filename);
                    PIXI.Loader.shared.add(filename.replace("PassiveSkillScreen", ""), `${utils.SKILL_TREES_URI}/${i.patch}/assets/${filename}`);
                }
            }
        }

        if (this.skillTreeAlternate.version !== "") {
            for (const id in this.skillTreeAlternate.skillSprites) {
                const sprites = this.skillTreeAlternate.skillSprites[id];
                const sprite = sprites[sprites.length - 1];
                const filename = sprite.filename.replace("https://web.poecdn.com/image/passive-skill/", "");
                if (sprite && addedAssets.indexOf(filename) < 0) {
                    addedAssets.push(filename);
                    PIXI.Loader.shared.add(filename.replace("PassiveSkillScreen", ""), `${utils.SKILL_TREES_URI}/${this.skillTreeAlternate.version}/assets/${filename}`);
                }
            }
        }
        // #endregion

        // #region Display Loading Bar
        const skillTreeData = filteredData[0];
        PIXI.Loader.shared.load();
        let loadedAssets = 0;
        const loadbarWidth = skillTreeData.width / 2;
        let progressText = "";
        PIXI.Loader.shared.onProgress.add(() => {
            loadedAssets++;
            const newText = `${Math.ceil(loadedAssets / addedAssets.length * 1000) / 10}%`;
            if (newText !== progressText) {
                this.viewport.removeChildren();
                progressText = newText;

                const loadbar = new PIXI.Graphics();
                loadbar.moveTo(0, 0);
                loadbar.beginFill(0xFFFFFF, .75);
                loadbar.lineStyle(2, 0xCBB59C)
                loadbar.drawRect(0, 0, (loadedAssets / addedAssets.length) * loadbarWidth, 50);
                loadbar.endFill();
                loadbar.position.set(-loadbarWidth / 2, screen.height / 2);
                this.viewport.addChild(loadbar);

                const text = new PIXI.Text(progressText, { fontSize: 250, fill: 0xFFFFFF });
                text.position.set(0, -50);
                this.viewport.addChild(text);
            }
        });
        // #endregion

        return promise;
    }

    public RenderBase = (): void => {
        if (!this.Initialized) {
            return;
        }

        this.SetupLayers();

        const background: PIXI.Container = new PIXI.Container();
        const characterStarts: PIXI.Container = new PIXI.Container();

        const temp = PIXI.Sprite.from(this.skillTreeData.assets["Background1"] ? "Background1" : "Background2");
        const backgroundSprite = new PIXI.TilingSprite(temp.texture, this.skillTreeData.width * (this.skillTreeData.scale * 1.25), this.skillTreeData.height * (this.skillTreeData.scale * 1.25));
        backgroundSprite.interactive = false;
        backgroundSprite.interactiveChildren = false;
        backgroundSprite.containerUpdateTransform = () => { };
        backgroundSprite.anchor.set(.5);
        this.SetLayer(RenderLayers.BackgroundColor, backgroundSprite);

        for (const id in this.skillTreeData.groups) {
            const group = this.skillTreeData.groups[id];
            const nodes = (group.n || group.nodes || []);
            if (nodes.length === 0 || nodes.find(id => this.skillTreeData.nodes[id].ascendancyName !== "") !== undefined) {
                continue;
            }

            let orbits = group.orbits || [];
            if (group.oo) {
                if (Array.isArray(group.oo)) {
                    group.oo = { "0": group.oo[0] };
                }

                for (const id in group.oo) {
                    orbits.push(+id);
                }
            }

            orbits = orbits.filter(x => x <= 3);
            const max = Math.max(...orbits);
            if (max <= 0) continue;

            const sprite = PIXI.Sprite.from(`PSGroupBackground${max}`);
            sprite.position.set(Math.ceil(group.x * this.skillTreeData.scale), Math.ceil(group.y * this.skillTreeData.scale));
            sprite.anchor.set(.5);
            background.addChild(sprite);

            if (max === 3) {
                sprite.anchor.set(.5, 1);
                const sprite2 = PIXI.Sprite.from(`PSGroupBackground${max}`);
                sprite2.rotation = Math.PI;
                sprite2.position.set(Math.ceil(group.x * this.skillTreeData.scale), Math.ceil(group.y * this.skillTreeData.scale));
                sprite2.anchor.set(.5, 1);
                background.addChild(sprite2);
            }
        }

        for (const id in this.skillTreeData.groups) {
            const group = this.skillTreeData.groups[id];
            const nodes = (group.n || group.nodes || []);
            if (nodes.filter(id => this.skillTreeData.nodes[id].isAscendancyStart).length <= 0) {
                continue;
            }
            const ascendancyName = nodes.map(id => this.skillTreeData.nodes[id].ascendancyName)[0];
            const sprite = PIXI.Sprite.from(`Classes${ascendancyName}`);
            sprite.position.set(Math.ceil(group.x * this.skillTreeData.scale), Math.ceil(group.y * this.skillTreeData.scale));
            sprite.anchor.set(.5);
            background.addChild(sprite);

            if (this.skillTreeData.classes === undefined) {
                continue;
            }
            for (const id in this.skillTreeData.classes) {
                const ascClasses = this.skillTreeData.classes[id];
                for (const classid in ascClasses.ascendancies) {
                    const ascClass = ascClasses.ascendancies[classid];
                    if (ascClass.name === ascendancyName && ascClass.flavourTextRect !== undefined) {
                        const rect = typeof ascClass.flavourTextRect === "string" ? ascClass.flavourTextRect.split(",") : [ascClass.flavourTextRect.x, ascClass.flavourTextRect.y];
                        const x = Math.ceil((group.x + +rect[0]) * this.skillTreeData.scale) - sprite.width / 2;
                        const y = Math.ceil((group.y + +rect[1]) * this.skillTreeData.scale) - sprite.height / 2;

                        let r = 0;
                        let g = 0;
                        let b = 0;
                        if (ascClass.flavourTextColour.indexOf(',') > 0) {
                            const c = ascClass.flavourTextColour.split(",");
                            r = +c[0];
                            g = +c[1];
                            b = +c[2];
                        } else {
                            const c = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec("#" + ascClass.flavourTextColour);
                            if (c && c.length === 4) {
                                r = parseInt(c[1], 16);
                                g = parseInt(c[2], 16);
                                b = parseInt(c[3], 16);
                            }
                        }

                        const colour = "0x" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
                        const text = new PIXI.Text(ascClass.flavourText, { fill: colour, fontSize: 48, fontFamily: "serif", fontStyle: "italic", stroke: 0x000000, strokeThickness: 4 });
                        text.position.set(x, y);
                        text.scale.set(this.skillTreeData.scale);
                        background.addChild(text);
                    }
                }
            }
        }

        for (const id of this.skillTreeData.root.out) {
            const node = this.skillTreeData.nodes[id];
            if (node.classStartIndex === undefined || node.nodeGroup === undefined) {
                continue;
            }

            const graphic = PIXI.Sprite.from("PSStartNodeBackgroundInactive");
            graphic.position.set(node.nodeGroup.x * this.skillTreeData.scale, node.nodeGroup.y * this.skillTreeData.scale);
            graphic.anchor.set(.5);
            characterStarts.addChild(graphic);
        }

        background.interactive = false;
        background.interactiveChildren = false;
        background.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.Background, background);

        characterStarts.interactive = false;
        characterStarts.interactiveChildren = false;
        characterStarts.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.CharacterStarts, characterStarts);

        this.RenderBaseNodes();
    }

    private RenderBaseNodes = () => {

        const connections: PIXI.Container = new PIXI.Container();
        const skillIcons: PIXI.Container = new PIXI.Container();
        const skillIcons_compare: PIXI.Container = new PIXI.Container();

        const drawnConnections: { [id: string]: boolean } = {};
        for (const id in this.skillTreeData.nodes) {
            const node = this.skillTreeData.nodes[id];
            if (node.nodeGroup === undefined) {
                continue;
            }
            const nodes = node.in
                .filter((outID) => {
                    return !drawnConnections[`${+id}-${outID}`] || !drawnConnections[`${outID}-${+id}`];
                })
                .map((outID) => {
                    drawnConnections[`${+id}-${outID}`] = true;
                    drawnConnections[`${outID}-${+id}`] = true;
                    return this.skillTreeData.nodes[outID]
                });

            const connection = this.SkillNodeRenderer.CreateConnections(node, nodes);
            if (connection !== null) {
                connections.addChild(connection);
            }

            const icon = this.SkillNodeRenderer.CreateIcon(node);
            if (icon !== null) {
                skillIcons.addChild(icon);
            }

            const frame = this.SkillNodeRenderer.CreateFrame(node, node.out.map(x => this.skillTreeData.nodes[x]));
            if (frame !== null) {
                skillIcons.addChild(frame);
            }

            if (this.skillTreeDataCompare !== undefined && this.skillTreeDataCompare.nodes[node.GetId()] === undefined) {
                const highlighter = this.SkillNodeRenderer.CreateHighlight(node, 0x00FF00);
                if (highlighter !== null) {
                    skillIcons.addChild(highlighter);
                }
            }
            const nodeSize = this.SkillNodeRenderer.GetNodeSize(node);
            if (this.skillTreeDataCompare !== undefined && this.skillTreeDataCompare.nodes[node.GetId()] !== undefined) {
                const node2 = this.skillTreeDataCompare.nodes[node.GetId()];
                let sDiff = node.stats.length !== node2.stats.length;
                const moved = nodeSize && (Math.abs(node.x - node2.x) > nodeSize.width || Math.abs(node.y - node2.y) > nodeSize.height);

                for (const s of node.stats) {
                    let found = false;
                    for (const s2 of node2.stats) {
                        if (s.toUpperCase() === s2.toUpperCase()) {
                            found = true;
                        }
                    }

                    if (!found) {
                        sDiff = true;
                        break;
                    }
                }

                if (sDiff || moved) {
                    this.skillTreeDataCompare.addState(node2, SkillNodeStates.Compared);
                    if (moved) this.skillTreeDataCompare.addState(node2, SkillNodeStates.Moved);
                    const highlighter = this.SkillNodeRenderer.CreateHighlight(node, 0xFFB000);
                    if (highlighter !== null) {
                        skillIcons.addChild(highlighter);
                    }
                }
            }
        }

        if (this.skillTreeDataCompare !== undefined) {
            for (const id in this.skillTreeDataCompare.nodes) {
                const node = this.skillTreeDataCompare.nodes[id];
                if (this.skillTreeData.nodes[node.GetId()] === undefined) {
                    this.skillTreeDataCompare.addState(node, SkillNodeStates.Compared);
                    const icon = this.SkillNodeRenderer.CreateIcon(node, "Compare")
                    if (icon !== null) {
                        skillIcons_compare.addChild(icon);
                    }
                    const frame = this.SkillNodeRenderer.CreateFrame(node, node.out.map(x => (this.skillTreeDataCompare as SkillTreeData).nodes[x]));
                    if (frame !== null) {
                        skillIcons_compare.addChild(frame);
                    }
                    const highlighter = this.SkillNodeRenderer.CreateHighlight(node, 0xFF0000, "Compare")
                    if (highlighter !== null) {
                        skillIcons_compare.addChild(highlighter);
                    }
                }
            }
        }

        skillIcons.interactive = false;
        skillIcons.interactiveChildren = true;
        skillIcons.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.SkillIcons, skillIcons);

        skillIcons_compare.interactive = false;
        skillIcons_compare.interactiveChildren = true;
        skillIcons_compare.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.SkillIconsCompare, skillIcons_compare);

        connections.interactive = false;
        connections.interactiveChildren = false;
        connections.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.Connections, connections);
    }

    public RenderActive = (): void => {
        if (!this.Initialized) {
            return;
        }
        this.RenderHover();

        this.ClearLayer(RenderLayers.ConnectionsActive);
        this.ClearLayer(RenderLayers.SkillIconsActive);
        this.ClearLayer(RenderLayers.SkillIconsActiveEffects);

        const skillIconActiveEffects: PIXI.Container = new PIXI.Container();
        const connectionsActive: PIXI.Container = new PIXI.Container();
        const skillIconsActive: PIXI.Container = new PIXI.Container();

        const drawnConnections: { [id: string]: boolean } = {};
        const activeNodes = this.skillTreeData.getNodes(SkillNodeStates.Active);
        for (const id in activeNodes) {
            const node = activeNodes[id];
            if (node.classStartIndex !== undefined) {
                continue;
            }

            const nodes = node.in
                .filter((outID) => {
                    return !drawnConnections[`${+id}-${outID}`] || !drawnConnections[`${outID}-${+id}`];
                })
                .map((outID) => {
                    drawnConnections[`${+id}-${outID}`] = true;
                    drawnConnections[`${outID}-${+id}`] = true;
                    return this.skillTreeData.nodes[outID]
                });

            const effect = this.SkillNodeRenderer.CreateIconEffect(node);
            if (effect !== null) {
                skillIconActiveEffects.addChild(effect);
            }

            const connection = this.SkillNodeRenderer.CreateConnections(node, nodes);
            if (connection !== null) {
                connectionsActive.addChild(connection);
            }
            for (const out of nodes) {
                const frame = this.SkillNodeRenderer.CreateFrame(out, node.out.map(x => this.skillTreeData.nodes[x]));
                if (frame !== null) {
                    skillIconsActive.addChild(frame);
                }
            }

            const icon = this.SkillNodeRenderer.CreateIcon(node);
            if (icon !== null) {
                skillIconsActive.addChild(icon);
            }
            const frame = this.SkillNodeRenderer.CreateFrame(node, node.out.map(x => this.skillTreeData.nodes[x]));
            if (frame !== null) {
                skillIconsActive.addChild(frame);
            }
        }

        skillIconActiveEffects.interactive = false;
        skillIconActiveEffects.interactiveChildren = false;
        skillIconActiveEffects.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.SkillIconsActiveEffects, skillIconActiveEffects);

        connectionsActive.interactive = false;
        connectionsActive.interactiveChildren = false;
        connectionsActive.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.ConnectionsActive, connectionsActive);

        skillIconsActive.interactive = false;
        skillIconsActive.interactiveChildren = false;
        skillIconsActive.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.SkillIconsActive, skillIconsActive);
    }

    public RenderCharacterStartsActive = (): void => {
        if (!this.Initialized) {
            return;
        }

        this.ClearLayer(RenderLayers.BackgroundActive);
        this.ClearLayer(RenderLayers.CharacterStartsActive);

        const backgroundActive: PIXI.Container = new PIXI.Container();
        const characterStartsActive: PIXI.Container = new PIXI.Container();

        for (const id of this.skillTreeData.root.out) {
            const node = this.skillTreeData.nodes[id];
            const classId = node.classStartIndex;
            if (classId === undefined || !node.is(SkillNodeStates.Active) || node.nodeGroup === undefined) {
                continue;
            }

            const className = utils.getKeyByValue(this.skillTreeData.constants.classes, classId);
            if (className === undefined) {
                throw new Error(`Couldn't find class name from constants: ${classId}`);
            }

            const commonName = this.skillTreeData.constants.classesToName[className];
            if (this.skillTreeData.extraImages !== undefined) {
                const extraImage = this.skillTreeData.extraImages[commonName]
                if (extraImage) {
                    const classNodeGraphic = PIXI.Sprite.from(`Background${className.replace("Class", "")}`);
                    classNodeGraphic.anchor.set(0)
                    classNodeGraphic.position.set(extraImage.x * this.skillTreeData.scale, extraImage.y * this.skillTreeData.scale);
                    backgroundActive.addChild(classNodeGraphic);
                }
            }

            const nodeGraphic = PIXI.Sprite.from(`center${commonName.toLocaleLowerCase()}`);
            nodeGraphic.anchor.set(.5)
            nodeGraphic.position.set(node.x, node.y);
            characterStartsActive.addChild(nodeGraphic);
        }

        backgroundActive.interactive = false;
        backgroundActive.interactiveChildren = false;
        backgroundActive.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.BackgroundActive, backgroundActive);

        characterStartsActive.interactive = false;
        characterStartsActive.interactiveChildren = false;
        characterStartsActive.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.CharacterStartsActive, characterStartsActive);
    }

    public StopRenderHover = (): void => {
        this.updateHover = false;
        if (!this.Initialized) {
            return;
        }

        this.RenderHover();
        this.RenderTooltip();
    }
    public StartRenderHover = (): void => {
        this.updateHover = true;
        if (!this.Initialized) {
            return;
        }

        this.RenderHover();
        this.RenderTooltip();
    }

    private RenderHover = async (): Promise<void> => {
        this.ClearLayer(RenderLayers.ConnectionsPathing);
        this.ClearLayer(RenderLayers.SkillIconsPathing);
        this.ClearLayer(RenderLayers.NodeMoveCompare);

        if (!this.updateHover) {
            return;
        }

        let nodeMoveCompare: PIXI.Graphics | undefined = undefined;
        const pathingConnections: PIXI.Container = new PIXI.Container();
        const pathingSkillIcons: PIXI.Container = new PIXI.Container();

        const drawnConnections: { [id: string]: boolean } = {};
        const pathingNodes = this.skillTreeData.getNodes(SkillNodeStates.Pathing);
        for (const id in pathingNodes) {
            const node = pathingNodes[id];
            const nodes = node.in
                .filter((outID) => {
                    return !drawnConnections[`${+id}-${outID}`] || !drawnConnections[`${outID}-${+id}`];
                })
                .map((outID) => {
                    drawnConnections[`${+id}-${outID}`] = true;
                    drawnConnections[`${outID}-${+id}`] = true;
                    return this.skillTreeData.nodes[outID]
                });

            const connection = this.SkillNodeRenderer.CreateConnections(node, nodes);
            if (connection !== null) {
                pathingConnections.addChild(connection);
            }
            const frame = this.SkillNodeRenderer.CreateFrame(node, node.out.map(x => this.skillTreeData.nodes[x]));
            if (frame !== null) {
                pathingSkillIcons.addChild(frame);
            }
        }

        if (this.skillTreeDataCompare !== undefined) {
            const hoveredNodes = this.skillTreeData.getNodes(SkillNodeStates.Hovered);
            for (const id in hoveredNodes) {
                const node = hoveredNodes[id];

                this.skillTreeDataCompare.clearState(SkillNodeStates.Hovered);

                let other = this.skillTreeDataCompare.nodes[node.GetId()];
                if (other === undefined) {
                    for (const idc in this.skillTreeDataCompare.nodes) {
                        const n = this.skillTreeDataCompare.nodes[idc];
                        if ((Math.abs(n.x - node.x) < 5 && Math.abs(n.y - node.y) < 5)) {
                            other = n;
                        }
                    }
                }

                if (other) {
                    if (other.is(SkillNodeStates.Compared)) {
                        this.skillTreeDataCompare.addState(other, SkillNodeStates.Hovered);
                    }

                    if (other.nodeGroup !== undefined && other.is(SkillNodeStates.Moved)) {
                        const highlighter = this.SkillNodeRenderer.CreateHighlight(other, 0xFF1493)
                        if (highlighter !== null) {
                            nodeMoveCompare = highlighter;
                        }
                    }
                }
            }
        }

        pathingConnections.interactive = false;
        pathingConnections.interactiveChildren = false;
        pathingConnections.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.ConnectionsPathing, pathingConnections);

        pathingSkillIcons.interactive = false;
        pathingSkillIcons.interactiveChildren = false;
        pathingSkillIcons.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.SkillIconsPathing, pathingSkillIcons);

        if (nodeMoveCompare !== undefined) {
            nodeMoveCompare.interactive = false;
            nodeMoveCompare.interactiveChildren = false;
            nodeMoveCompare.containerUpdateTransform = () => { };
            this.SetLayer(RenderLayers.NodeMoveCompare, nodeMoveCompare);
        }
    }

    private RenderTooltip = async (): Promise<void> => {
        this.ClearLayer(RenderLayers.Tooltip);
        this.ClearLayer(RenderLayers.TooltipCompare);

        let tooltip: PIXI.Graphics | undefined = undefined;
        let tooltipCompare: PIXI.Graphics | undefined = undefined;

        if (!this.updateHover) {
            return
        }

        const nodes = this.skillTreeData.getNodes(SkillNodeStates.Hovered);
        let hoveredNode: SkillNode | undefined = undefined;
        for (const id in nodes) {
            const node = nodes[id];
            hoveredNode = node;

            const padding = 10;
            const text = this.SkillNodeRenderer.CreateTooltip(node, "Base");
            text.position.set(padding / 2, padding / 2);

            tooltip = new PIXI.Graphics();
            tooltip.beginFill(0x000000, .75);
            tooltip.lineStyle(2, 0xCBB59C)
            tooltip.drawRect(0, 0, text.width + padding, text.height + padding);
            tooltip.endFill();

            tooltip.addChild(text);
        }

        let hoveredCompareNode: SkillNode | undefined = undefined;
        if (this.skillTreeDataCompare !== undefined) {
            const nodes = this.skillTreeDataCompare.getNodes(SkillNodeStates.Hovered);
            for (const id in nodes) {
                const node = nodes[id];
                if (node.nodeGroup === undefined) {
                    continue;
                }
                hoveredCompareNode = node;

                const padding = 10;
                const text = this.SkillNodeRenderer.CreateTooltip(node, "Compare");
                text.position.set(padding / 2, padding / 2);

                tooltipCompare = new PIXI.Graphics();
                tooltipCompare.beginFill(0x000000, .75);
                tooltipCompare.lineStyle(2, 0xFFB000)
                tooltipCompare.drawRect(0, 0, text.width + padding, text.height + padding);
                tooltipCompare.endFill();

                tooltipCompare.addChild(text);
            }
        }

        if (tooltip === undefined && tooltipCompare !== undefined) {
            tooltip = tooltipCompare;
            hoveredNode = hoveredCompareNode;

            tooltipCompare = undefined;
            hoveredCompareNode = undefined;
        }

        if (tooltip !== undefined) {
            tooltip.interactive = false;
            tooltip.interactiveChildren = false;
            tooltip.containerUpdateTransform = () => { };
            this.SetLayer(RenderLayers.Tooltip, tooltip);
        }

        if (tooltipCompare !== undefined) {
            tooltipCompare.interactive = false;
            tooltipCompare.interactiveChildren = false;
            tooltipCompare.containerUpdateTransform = () => { };
            this.SetLayer(RenderLayers.TooltipCompare, tooltipCompare);
        }

        if (tooltip !== undefined && hoveredNode !== undefined) {
            const bounds = tooltip.getBounds();
            const size = hoveredNode.GetTargetSize();
            const scaleX = tooltip.width / bounds.width / devicePixelRatio;
            const scaleY = tooltip.height / bounds.height / devicePixelRatio;

            if (tooltip.worldTransform.tx + bounds.width > screen.width) {
                tooltip.x = hoveredNode.x - tooltip.width * scaleX - size.width;
            } else {
                tooltip.x = hoveredNode.x + size.width;
            }

            if (tooltip.worldTransform.ty + bounds.height > screen.height) {
                tooltip.y = hoveredNode.y - tooltip.height * scaleY + size.height / 2;
            } else {
                tooltip.y = hoveredNode.y - size.height / 2;
            }

            tooltip.scale.set(scaleX, scaleY);

            if (tooltipCompare !== undefined && hoveredCompareNode !== undefined) {
                const boundsCompare = tooltipCompare.getBounds();

                tooltipCompare.y = tooltip.y;
                tooltipCompare.x = tooltip.x + tooltip.width;

                tooltipCompare.scale.set(tooltipCompare.width / boundsCompare.width / devicePixelRatio, tooltipCompare.height / boundsCompare.height / devicePixelRatio);
            }
        }
    }

    public RenderHighlight = (): void => {
        if (!this.Initialized) {
            return;
        }

        this.ClearLayer(RenderLayers.Highlights);

        const highlights = new PIXI.Container();

        const nodes = this.skillTreeData.getNodes(SkillNodeStates.Highlighted);
        for (const id in nodes) {
            const node = nodes[id];
            const highlight = this.SkillNodeRenderer.CreateHighlight(node);
            if (highlight !== null) {
                highlights.addChild(highlight)
            }
        }

        highlights.interactive = false;
        highlights.interactiveChildren = false;
        highlights.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayers.Highlights, highlights);
    }

    public CreateScreenshot = (mimeType: 'image/jpeg' | 'image/webp'): string => {
        return this.pixi.renderer.plugins.extract.base64(this.viewport, mimeType, 1);
    }
}