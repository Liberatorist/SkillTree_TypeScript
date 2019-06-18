﻿interface ISkillNodeAlternate {
    _raw: any;
    faction: number;
    flavourText: string[];
    icon: string;
    id: string;
    isAddition: boolean;
    name: string,
    passiveType: number[];
    randomMax: number;
    randomMin: number;
    stats: ISkillNodeAlternateStat[];
}

interface ISkillNodeAlternateStat {
    text: string[];
    values: number[][];
}