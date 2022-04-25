// Minimal type definitions for the purpose of ...

export enum SearchCategoryType {
    Demographic,
    Appointment,
    Measurement,
    Procedure,
    // ...
}

enum QuestionType {
    SingleAnswer,
    MultipleChoiceSingleAnswer,
    Repeated
}

enum QueryMatchType {
    Any,
    All,
    None,
    NoneAll
}

enum SortDirection {
    Ascending,
    Descending
}

class Section {
    id: string;
}

class Question {
    id: string;
    disabled: boolean;
    questionType: QuestionType;
    answers?: Answer[];
    sortDirection: SortDirection;
}

class Answer {
    id: string;
    hidden: boolean;
    question?: Question;
    query?: Query;
}

class Query {
    id: string;
    disabled: boolean;
    collect: boolean;
    parent?: Query;
    groups?: Query[];
    answer?: Answer;
    category: SearchCategoryType;
    match: QueryMatchType;
    sortDirection: SortDirection;
}

type AnswerToTermsMap = Map<string, Query[]>;
type TermToAnswerMap = Map<string, Answer>;
type AnswerMap = Map<string, Answer>;
type TermMap = Map<string, Query>;

interface QueryRepository {
    /** Returns all nodes which are (indirectly) descendants of the given queries */
    findDescendantsForEntities(query: Query[]): Promise<Query[]>;
}

/**
 * Create a single query tree by combining all the queries from each answer.
 * Adds required relationships for query building, e.g. filters.
 * Builds indexes for various entities and relationships.
 * Sets the sortDirection for terms based on the sortDirection of the question.
 */
/* eslint-disable sonarjs/cognitive-complexity */
export async function getDataCollectorQuery(
    projectId: string,
    queryRepository: QueryRepository
): Promise<
    [
        Query | undefined,
        AnswerToTermsMap,
        TermToAnswerMap,
        AnswerMap,
        Query[],
        TermMap,
        Map<string, boolean>, // collectedChildrenMap
        Map<string, Section>
    ]
> {
    // We cache the terms found for an answer, so that we don't
    // have to make this call when we are building the sql for each answer
    const answerToTermsMap: AnswerToTermsMap = new Map();
    const termToAnswerMap: TermToAnswerMap = new Map();

    const [sectionMap, questionMap, answerMap] = await getSectionsQuestionsAndAnswers(projectId);

    const questionCombinedQueries = new Map<string, Query[]>();

    const answers = [...answerMap.values()];

    const rootQueries = answers
        .map((answer) => {
            // Only include `hidden` answers for multiple choice questions
            // (each question allows for a custom 'If nothing found' label)
            if (answer.question && answer.hidden) {
                const question = questionMap.get(answer.question.id);
                if (question?.questionType !== QuestionType.MultipleChoiceSingleAnswer) {
                    return;
                }
            }

            return answer.query;
        })
        .filter((query): query is Query => Boolean(query));

    const collectedChildrenMap = new Map<string, boolean>();

    if (!rootQueries.length) {
        return [
            undefined,
            answerToTermsMap,
            termToAnswerMap,
            answerMap,
            [],
            new Map(),
            collectedChildrenMap,
            sectionMap
        ];
    }

    // We want to hydrate all answer queries of the project
    const terms: Query[] = await queryRepository.findDescendantsForEntities(rootQueries);

    const [tree, termMap] = buildQueryTree(terms);

    const combinedQuery = new Query();
    combinedQuery.match = QueryMatchType.Any;
    combinedQuery.groups = [];

    // The root query is traversed differently than the rest of the tree
    // because it is linked to an answer
    for (const rootQuery of rootQueries) {
        const answer =
            rootQuery.answer && answerMap.has(rootQuery.answer.id)
                ? answerMap.get(rootQuery.answer.id)
                : undefined;
        const question =
            answer?.question && questionMap.has(answer.question.id)
                ? questionMap.get(answer.question.id)
                : undefined;

        // This should never happen if the maps were correctly built
        if (!answer || !question) {
            continue;
        }

        // Attach the answer root query to the combined query
        combinedQuery.groups.push(rootQuery);

        rootQuery.groups = tree.get(rootQuery.id) ?? [];

        // Note: for now answers don't have nested groups, but
        // walkTree is used to support it for future needs.
        for (const term of rootQuery.groups) {
            walkTree(term, answer, question, tree, {
                termToAnswerMap,
                answerToTermsMap,
                collectedChildrenMap
            });
        }

        // Keep track of all the answer rootQueries per question
        // (we use them to create the question hashes)
        addOneToMultiMap(questionCombinedQueries, question.id, rootQuery);
    }

    // Create a map of `question.queryHash` based on the answer queries
    for (const questionId of questionCombinedQueries.keys()) {
        // Create an answer map consisting only the answers of this question
        // (e.g. we don't want it to be affected by other questions)
        const question = questionMap.get(questionId);

        // CTAPP-5130: Do not hash disabled questions
        if (!question || question.disabled) {
            continue;
        }

        // NOTE: This requires `hydrateQuestions` to be called
        const localAnswers = question.answers ?? [];
        const localAnswersMap = new Map<string, Answer>();

        for (const answer of localAnswers) {
            localAnswersMap.set(answer.id, answer);
        }
    }

    return [
        combinedQuery,
        answerToTermsMap,
        termToAnswerMap,
        answerMap,
        terms,
        termMap,
        collectedChildrenMap,
        sectionMap
    ];
}

/**
 * Propagates sortDirection down the tree.
 * Creates indexes that maps entities to entities in the tree
 */
function walkTree(
    term: Query,
    answer: Answer,
    question: Question,
    tree: Map<string, Query[]>,
    indexes: {
        termToAnswerMap: TermToAnswerMap;
        answerToTermsMap: AnswerToTermsMap;
        collectedChildrenMap: Map<string, boolean>;
    }
): void {
    const termId = term.id;

    term.sortDirection = question.sortDirection;

    indexes.termToAnswerMap.set(termId, answer);
    addOneToMultiMap(indexes.answerToTermsMap, answer.id, term);

    term.groups = tree.get(term.id) ?? [];

    if (term.disabled || !term.groups.length) {
        return;
    }

    // In CDC this should only ever walk 1-2 levels deep
    // because we don't allow groups in CDC
    // except for nested criteria
    for (const child of term.groups) {
        if (child.disabled) {
            continue;
        }

        walkTree(child, answer, question, tree, indexes);
    }

    if (term.category) {
        const collectedChildren = term.groups.filter((v) => v.collect);
        indexes.collectedChildrenMap.set(term.id, collectedChildren.length !== 0);
    }
}

/** Returns all sections, questions and answers for the project with the given identifier */
export async function getSectionsQuestionsAndAnswers(
    projectId: string
): Promise<[
    Map<string, Section>,
    Map<string, Question>,
    Map<string, Answer>
]> {
    // Implementation omitted
    return [new Map(), new Map(), new Map()];
}

function buildQueryTree(terms: Query[]): [Map<string, Query[]>, TermMap] {
    const tree = new Map<string, Query[]>();
    const termMap: TermMap = new Map();
    for (const term of terms) {
        if (!term.parent?.id) {
            continue;
        }
        termMap.set(term.id, term);
        addOneToMultiMap(tree, term.parent.id, term);
    }

    return [tree, termMap];
}

function addOneToMultiMap<Key, Value>(map: Map<Key, Value[]>, key: Key, value: Value): void {
    const values = map.get(key);

    if (values) {
        values.push(value);
    } else {
        map.set(key, [value]);
    }
}
