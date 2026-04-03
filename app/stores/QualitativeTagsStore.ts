import { computed } from "mobx";
import QualitativeTag from "~/models/QualitativeTag";
import type RootStore from "~/stores/RootStore";
import Store from "~/stores/base/Store";

/**
 * Client-side cache and querying utilities for qualitative tags.
 */
export default class QualitativeTagsStore extends Store<QualitativeTag> {
    constructor(rootStore: RootStore) {
        super(rootStore, QualitativeTag);
    }

    /**
     * Returns tags available in the provided collection.
     *
     * @param collectionId the collection identifier.
     * @returns sorted tag list.
     */
    inCollection(collectionId: string): QualitativeTag[] {
        return this.orderedData.filter((tag) => tag.collectionId === collectionId);
    }

    @computed
    get orderedData(): QualitativeTag[] {
        const tags = Array.from(this.data.values());

        return tags.sort((a, b) => a.name.localeCompare(b.name));
    }
}
