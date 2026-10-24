export type ClientProfile = {
  id: string;
  search_queries: string[];
  max_results: number | null;
};

export type Candidate = {
  name: string;
  url: string;
  snippet: string;
  query: string;
};
