import { QueryFilter, QueryMatchType, SortDirection } from "@ctcue/utils";

interface Query {
    id: string;

    match: QueryMatchType; // ALL, ANY, NOT

    category?: string; // medication, measurement, report, etc.

    parent?: Query;
    groups?: Query[];

    filters?: QueryFilter[]; // List of filter values (e.g. `start_date > 2018`)

    sortDirection?: SortDirection; // "Asc / Desc"

    /**
     * Determines if query creation should be disabled. Will also halt
     * creation of nested groups.
     */
    disabled: boolean; // default: false
}

/** Query tree container that can be shared between optimizers */
export class QueryTreeContainer {
    private groups: Query[] = [];
    private terms: Query[] = [];
    private parentTerms: Query[] = [];
    private termsByNestedTerm: Query[] = [];

    constructor(rootNode?: Query) {
        this.indexTree(rootNode);
    }

    /** Returns all terms */
    getAllTerms(): Query[] {
        return Array.from(this.terms.values());
    }

    /** Returns all parent terms */
    getParentTerms(): Query[] {
        return Array.from(this.parentTerms.values());
    }

    /** Returns the term with the given identifier */
    getTerm(termId: string): Query | undefined {
        return this.terms.find((t) => t.id === termId);
    }

    /** Returns the term with the given identifier */
    getGroup(groupId: string): Query | undefined {
        return this.groups.find((t) => t.id === groupId);
    }

    /** Returns the parent term of the term with the given identifier */
    getParentTerm(termId: string): Query | undefined {
        return this.termsByNestedTerm.find((t) => t.id === termId);
    }

    /** Adds all terms in the given (sub)tree to the term map */
    private indexTree(node?: Query, parentNode?: Query): void {
        if (!node) {
            return;
        }

        if (node.id) {
            // Check if the query has a category.
            // Queries without categories are groups.
            if (node.category) {
                this.terms.push(node);

                // Check if the query parent has a category
                if (parentNode?.id && parentNode.category) {
                    this.termsByNestedTerm.push(parentNode);
                } else if (!node.disabled) {
                    this.parentTerms.push(node);
                }
            } else {
                this.groups.push(node);
            }
        }

        if (node.groups?.length) {
            for (const group of node.groups) {
                this.indexTree(group, node);
            }
        }
    }
}
