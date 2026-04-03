import { observer } from "mobx-react";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import type Collection from "~/models/Collection";
import Notice from "~/components/Notice";
import PlaceholderText from "~/components/PlaceholderText";
import useRequest from "~/hooks/useRequest";
import { client } from "~/utils/ApiClient";

interface QualitativeStatisticsDocument {
  id: string;
  title: string;
  count: number;
  snippets: string[];
}

interface QualitativeStatisticsTag {
  id: string;
  name: string;
  code: string;
  color: string;
  description: string | null;
  total: number;
  documents: QualitativeStatisticsDocument[];
}

interface QualitativeStatisticsResponse {
  data: {
    collection: {
      id: string;
      name: string;
      documentCount: number;
    };
    tags: QualitativeStatisticsTag[];
  };
}

type Props = {
  collection: Collection;
};

/**
 * Collection tab content that summarizes qualitative tag usage in the collection.
 *
 * @param collection the active collection.
 * @returns rendered qualitative statistics grouped by tag and document.
 */
const QualitativeStatistics = observer(function QualitativeStatistics({
  collection,
}: Props) {
  const { t } = useTranslation();

  const { request, data, loading, loaded, error } = useRequest(
    useCallback(
      () =>
        client.post<QualitativeStatisticsResponse>("/qualitativeTags.statistics", {
          collectionId: collection.id,
        }),
      [collection.id]
    )
  );

  useEffect(() => {
    void request();
  }, [request]);

  if (loading && !loaded) {
    return (
      <Wrapper>
        <PlaceholderText height={24} width={260} />
        <PlaceholderText width={420} />
        <PlaceholderText width={300} />
      </Wrapper>
    );
  }

  if (error) {
    return (
      <Wrapper>
        <Notice>{t("Unable to load qualitative statistics")}</Notice>
      </Wrapper>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <Wrapper>
      <Title>{t("Qualitative statistics")}</Title>
      <CollectionMeta>
        {t("{{name}}, {{count}} documents", {
          name: data.data.collection.name,
          count: data.data.collection.documentCount,
        })}
      </CollectionMeta>

      {data.data.tags.map((tag) => (
        <TagSection key={tag.id}>
          <TagTitle>
            <TagColor color={tag.color} />
            <span>
              {tag.code} - {tag.name} {t("total")}: {tag.total}
            </span>
          </TagTitle>

          {tag.documents.length === 0 ? (
            <EmptyText>{t("No occurrences yet")}</EmptyText>
          ) : (
            tag.documents.map((document) => (
              <DocumentSection key={document.id}>
                <DocumentTitle>
                  {document.title} ({document.count})
                </DocumentTitle>
                <SnippetList>
                  {document.snippets.map((snippet, index) => (
                    <SnippetItem key={`${document.id}-${tag.id}-${index}`}>
                      {snippet}
                    </SnippetItem>
                  ))}
                </SnippetList>
              </DocumentSection>
            ))
          )}
        </TagSection>
      ))}
    </Wrapper>
  );
});

const Wrapper = styled.div`
  padding: 24px;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 24px;
`;

const CollectionMeta = styled.p`
  margin-top: 8px;
  color: ${s("textSecondary")};
`;

const TagSection = styled.section`
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid ${s("divider")};
`;

const TagTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 18px;
`;

const TagColor = styled.span<{ color: string }>`
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: ${(props) => props.color};
  flex-shrink: 0;
`;

const DocumentSection = styled.section`
  margin-top: 16px;
`;

const DocumentTitle = styled.h4`
  margin: 0 0 6px;
  font-size: 15px;
`;

const SnippetList = styled.ul`
  margin: 0;
  padding-left: 18px;
`;

const SnippetItem = styled.li`
  margin: 4px 0;
  color: ${s("text")};
`;

const EmptyText = styled.p`
  margin: 10px 0 0;
  color: ${s("textSecondary")};
`;

export default QualitativeStatistics;
