export type ClientProfile = {
  id: string;
  search_queries: string[];
};

export type Candidate = {
  name: string;
  url: string;
  snippet: string;
  query: string;
  followers?: number | null;
};
