import { SkillTreeData } from "./SkillTreeData";
import { SkillNode, SkillNodeStates } from "./SkillNode";
import { SkillTreeEvents } from "./SkillTreeEvents";
import { SkillTreeCodec } from "./url-processing/SkillTreeCodec";

export class SkillTreeUtilities {
    skillTreeData: SkillTreeData;
    skillTreeDataCompare: SkillTreeData | undefined;
    skillTreeCodec: SkillTreeCodec;

    constructor(context: SkillTreeData, contextComapre: SkillTreeData | undefined) {
        this.skillTreeData = context;
        this.skillTreeDataCompare = contextComapre;
        this.skillTreeCodec = new SkillTreeCodec();

        SkillTreeEvents.node.on("click", this.click);
        SkillTreeEvents.node.on("in", this.mouseover);
        SkillTreeEvents.node.on("out", this.mouseout);

        SkillTreeEvents.controls.on("class-change", this.changeStartClass);
        SkillTreeEvents.controls.on("ascendancy-class-change", this.changeAscendancyClass);
        SkillTreeEvents.controls.on("search-change", this.searchChange);

        SkillTreeEvents.skill_tree.on("encode-url", this.encodeURL);
    }

    private lastHash = "";
    public decodeURL = () => {
        if (window.location.hash === "") {
            this.changeStartClass(3, false);
        }
        if (this.lastHash === window.location.hash) {
            return;
        }
        this.lastHash = window.location.hash;

        try {
            const data = window.location.hash.replace("#", "");
            if (data === null) {
                window.location.hash = "";
                return;
            }

            const def = this.skillTreeCodec.decodeURL(data, this.skillTreeData);
            this.skillTreeData.version = def.Version;
            this.changeStartClass(def.Class, false);
            this.changeAscendancyClass(def.Ascendancy, false);
            for (const node of def.Nodes) {
                this.skillTreeData.addStateById(`${node.skill}`, SkillNodeStates.Active)
            }

            for (const node of def.ExtendedNodes) {
                this.skillTreeData.addStateById(`${node.skill}`, SkillNodeStates.Active)
            }

            for (const [node, effect] of def.MasteryEffects) {
                this.skillTreeData.addStateById(`${node.skill}`, SkillNodeStates.Active)
                this.skillTreeData.masteryEffects[node.skill] = effect;
            }

            for (const id in this.skillTreeData.classStartNodes) {
                if (this.skillTreeData.nodes[id].is(SkillNodeStates.Active)) {
                    const refund = this.getRefundNodes(this.skillTreeData.nodes[id]);
                    for (const i of refund) {
                        this.skillTreeData.removeState(i, SkillNodeStates.Active);
                    }
                }
            }

            this.encodeURL();
        }
        catch (ex) {
            window.location.hash = "";
            console.log(ex);
        }
    }

    private encodeURL = () => {
        SkillTreeEvents.skill_tree.fire("active-nodes-update");
        this.broadcastSkillCounts();
        window.location.hash = `#${this.skillTreeCodec.encodeURL(this.skillTreeData)}`;
    }

    private broadcastSkillCounts = () => {
        //need to add bandits here
        let maximumNormalPoints = this.skillTreeData.points.totalPoints;
        const maximumAscendancyPoints = this.skillTreeData.points.ascendancyPoints;
        let normalNodes = 0;
        let ascNodes = 0;

        const nodes = this.skillTreeData.getNodes(SkillNodeStates.Active);
        for (const id in nodes) {
            const node = nodes[id];
            if (node.classStartIndex === undefined && !node.isAscendancyStart) {
                if (node.ascendancyName === "") {
                    normalNodes++;
                } else {
                    ascNodes++;
                }
                maximumNormalPoints += node.grantedPassivePoints;
            }
        }

        SkillTreeEvents.skill_tree.fire("normal-node-count", normalNodes);
        SkillTreeEvents.skill_tree.fire("normal-node-count-maximum", maximumNormalPoints);
        SkillTreeEvents.skill_tree.fire("ascendancy-node-count", ascNodes);
        SkillTreeEvents.skill_tree.fire("ascendancy-node-count-maximum", maximumAscendancyPoints);
    }

    public changeStartClass = (start: number, encode = true) => {
        for (const id in this.skillTreeData.classStartNodes) {
            const node = this.skillTreeData.nodes[id];
            if (node.classStartIndex === undefined) {
                continue;
            }

            if (node.classStartIndex !== start) {
                this.skillTreeData.removeState(node, SkillNodeStates.Active);
                continue;
            }

            this.skillTreeData.addState(node, SkillNodeStates.Active);
            SkillTreeEvents.skill_tree.fire("class-change", node);
            for (const i of this.getRefundNodes(node)) {
                this.skillTreeData.removeState(i, SkillNodeStates.Active);
            }
        }
        this.changeAscendancyClass(0, false, true);

        if (encode) {
            this.encodeURL();
        }
    }

    public changeAscendancyClass = (start: number, encode = true, newStart = false) => {
        if (newStart) SkillTreeEvents.skill_tree.fire("ascendancy-class-change");
        if (this.skillTreeData.classes.length === 0) {
            return;
        }

        const ascClasses = this.skillTreeData.classes[this.skillTreeData.getStartClass()].ascendancies;
        if (ascClasses === undefined) {
            return;
        }

        const ascClass = ascClasses[start];
        const name = ascClass !== undefined ? ascClass.name : undefined;

        for (const id in this.skillTreeData.ascendancyNodes) {
            const node = this.skillTreeData.nodes[id];
            if (node.ascendancyName !== name) {
                this.skillTreeData.removeState(node, SkillNodeStates.Active);
                continue;
            }
            if (node.isAscendancyStart) {
                this.skillTreeData.addState(node, SkillNodeStates.Active);
            }
        }

        if (encode) {
            this.encodeURL();
        }
    }

    public searchChange = (str: string | undefined = undefined) => {
        this.skillTreeData.clearState(SkillNodeStates.Highlighted);

        if (str !== undefined && str.length !== 0) {
            const regex = new RegExp(str, "gi");
            for (const id in this.skillTreeData.nodes) {
                const node = this.skillTreeData.nodes[id];
                if (node.isAscendancyStart || node.classStartIndex !== undefined) {
                    continue;
                }
                if (node.name.match(regex) !== null || node.stats.find(stat => stat.match(regex) !== null) !== undefined) {
                    this.skillTreeData.addState(node, SkillNodeStates.Highlighted);
                }
            }
        }

        SkillTreeEvents.skill_tree.fire("highlighted-nodes-update");
    }

    private click = (node: SkillNode) => {
        if (node.is(SkillNodeStates.Compared)) {
            return;
        }

        if (node.classStartIndex !== undefined || node.isAscendancyStart) {
            return;
        }

        const refund = this.getRefundNodes(node);
        const shortest = this.getShortestPath(node);

        if (shortest.length > 0 || node.is(SkillNodeStates.Active)) {
            for (const i of refund) {
                if (i.classStartIndex !== undefined) {
                    continue;
                }
                this.skillTreeData.removeState(i, SkillNodeStates.Active);
            }
        }

        for (const i of shortest) {
            if (!i.is(SkillNodeStates.Active) && refund.indexOf(i) < 0) {
                this.skillTreeData.addState(i, SkillNodeStates.Active);
            }
        }

        this.skillTreeData.clearState(SkillNodeStates.Hovered);
        this.skillTreeData.clearState(SkillNodeStates.Pathing);
        this.skillTreeDataCompare?.clearState(SkillNodeStates.Hovered);
        this.encodeURL();
    }

    private mouseover = (node: SkillNode) => {
        this.skillTreeData.clearState(SkillNodeStates.Hovered);
        this.skillTreeData.clearState(SkillNodeStates.Pathing);
        this.skillTreeDataCompare?.clearState(SkillNodeStates.Hovered);

        if (node.classStartIndex === undefined) {
            if (node.is(SkillNodeStates.Compared)) {
                this.skillTreeDataCompare?.addState(node, SkillNodeStates.Hovered);
            } else {
                this.skillTreeData.addState(node, SkillNodeStates.Hovered);

                if (this.skillTreeData.tree === "Atlas" && node.isMastery) {
                    for (const id in this.skillTreeData.nodes) {
                        const other = this.skillTreeData.nodes[id];
                        if (!other.isMastery) {
                            continue;
                        }

                        if (other.name !== node.name) {
                            continue;
                        }

                        this.skillTreeData.addState(other, SkillNodeStates.Hovered);
                    }
                }
            }
        }
        const shortest = this.getShortestPath(node);
        for (const i of shortest) {
            if (!i.is(SkillNodeStates.Pathing) && !i.is(SkillNodeStates.Active)) {
                this.skillTreeData.addState(i, SkillNodeStates.Pathing);
            }
        }
        node.hoverText = shortest.length.toString();

        if (shortest.length > 0 || node.is(SkillNodeStates.Active)) {
            const refund = this.getRefundNodes(node);
            for (const i of refund) {
                this.skillTreeData.addState(i, SkillNodeStates.Pathing);
            }
            if (refund.length > 0) {
                node.hoverText = refund.length.toString();
            }
        }

        SkillTreeEvents.skill_tree.fire("hovered-nodes-start", node);
    }

    private mouseout = (node: SkillNode) => {
        this.skillTreeData.clearState(SkillNodeStates.Hovered);
        this.skillTreeData.clearState(SkillNodeStates.Pathing);
        this.skillTreeDataCompare?.clearState(SkillNodeStates.Hovered);
        SkillTreeEvents.skill_tree.fire("hovered-nodes-end", node);
    }

    private getShortestPath = (target: SkillNode): Array<SkillNode> => {
        if (target.isBlighted) {
            return new Array<SkillNode>(target);
        }

        const skilled = this.skillTreeData.getSkilledNodes();
        if (skilled[target.GetId()]) {
            return new Array<SkillNode>();
        }

        const frontier: Array<SkillNode> = [];
        const distance: { [id: string]: number } = {};
        const adjacent = this.getAdjacentNodes(skilled);
        for (const id in adjacent) {
            if (id === target.GetId()) {
                const path = new Array<SkillNode>();
                path.push(target);
                return path;
            }
            const node = this.skillTreeData.nodes[id];
            if (node.isAscendancyStart && !node.is(SkillNodeStates.Active)) {
                continue;
            }
            frontier.push(adjacent[id]);
            distance[id] = 1;
        }

        const explored = skilled;
        const prev: { [id: string]: SkillNode } = {};
        while (frontier.length > 0) {
            const current = frontier.shift();
            if (current === undefined) {
                continue;
            }

            explored[current.GetId()] = current;
            const dist = distance[current.GetId()];
            for (const id of current.out) {
                const out = this.skillTreeData.nodes[id];
                if ((current.ascendancyName === "" && out.ascendancyName !== "" && !out.is(SkillNodeStates.Active))
                    || (current.ascendancyName !== "" && out.ascendancyName === "" && !current.is(SkillNodeStates.Active))) {
                    continue;
                }
                if (explored[id] || distance[id]) {
                    continue;
                }
                if (out.isAscendancyStart && !out.is(SkillNodeStates.Active)) {
                    continue;
                }
                if (out.classStartIndex !== undefined && !out.is(SkillNodeStates.Active)) {
                    continue;
                }

                distance[id] = dist + 1;
                prev[id] = current;
                frontier.push(out);
                if (out.GetId() === target.GetId()) {
                    frontier.length = 0;
                }
            }
        }

        if (distance[target.GetId()] === undefined) {
            return new Array<SkillNode>();
        }

        let current: SkillNode | undefined = target;
        const path = new Array<SkillNode>();
        while (current !== undefined) {
            path.push(current);
            current = prev[current.GetId()];
        }
        return path.reverse();
    }

    private getRefundNodes = (source: SkillNode): Array<SkillNode> => {
        let characterStartNode: SkillNode | undefined = undefined;
        for (const id in this.skillTreeData.classStartNodes) {
            const node = this.skillTreeData.nodes[id];
            if (node.is(SkillNodeStates.Active) && node.classStartIndex !== undefined) {
                characterStartNode = node;
            }
        }
        if (characterStartNode === undefined) {
            return new Array<SkillNode>();
        }

        let frontier = new Array<SkillNode>();
        const reachable: { [id: string]: SkillNode } = {};
        for (const id of characterStartNode.out) {
            const out = this.skillTreeData.nodes[id];
            if (out.ascendancyName !== "" && source.ascendancyName !== "" && out.ascendancyName !== source.ascendancyName) {
                continue;
            }
            if (out.is(SkillNodeStates.Active) && out.GetId() !== source.GetId()) {
                frontier.push(out);
                reachable[id] = out;
            }
        }
        while (frontier.length > 0) {
            const nextFrontier = new Array<SkillNode>();
            for (const node of frontier) {
                for (const id of node.out) {
                    const out = this.skillTreeData.nodes[id];
                    if (out.isMultipleChoiceOption && source.isMultipleChoiceOption) {
                        const outchoice = out.in.find(id => this.skillTreeData.nodes[id].isMultipleChoice);
                        if (outchoice !== undefined && outchoice === source.in.find(id => this.skillTreeData.nodes[id].isMultipleChoice)) {
                            continue;
                        }
                    }
                    if (out.ascendancyName !== "" && source.ascendancyName !== "" && out.ascendancyName !== source.ascendancyName) {
                        continue;
                    }
                    if (out.GetId() === source.GetId() || reachable[id] || !out.is(SkillNodeStates.Active)) {
                        continue;
                    }

                    nextFrontier.push(out);
                    reachable[id] = out;
                }
            }

            frontier = nextFrontier;
        }

        const unreachable = new Array<SkillNode>();
        const skilledNodes = this.skillTreeData.getSkilledNodes();
        for (const id in skilledNodes) {
            if (reachable[id] === undefined && this.skillTreeData.nodes[id].classStartIndex === undefined) {
                unreachable.push(this.skillTreeData.nodes[id]);
            }
        }
        return unreachable;
    }

    private getAdjacentNodes = (start: { [id: string]: SkillNode }): { [id: string]: SkillNode } => {
        const adjacentNodes: { [id: string]: SkillNode } = {};
        for (const parent in start) {
            for (const id of start[parent].out) {
                const out = this.skillTreeData.nodes[id];
                if (out.classStartIndex !== undefined && !out.is(SkillNodeStates.Active)) {
                    continue;
                }
                adjacentNodes[id] = out;
            }
        }
        return adjacentNodes;
    }
}