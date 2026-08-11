-- Add hosted-from provenance for exact Resource Library files found in the
-- supplied PADLET IMPORT - COMPRESSED archive.
--
-- Only unique normalized filename matches are eligible. Ambiguous and missing
-- names are deliberately excluded. Existing original-source assignments remain
-- primary and are not changed.

create temporary table _dp_padlet_archive_files (
  archive_path text primary key,
  archive_name text not null
) on commit drop;

insert into _dp_padlet_archive_files (archive_path, archive_name) values
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/Course_Outline.pptx', 'Course_Outline.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/Extended_Essay_Sample.pdf', 'Extended_Essay_Sample.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/p1_Sample__1_.pdf', 'p1_Sample__1_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/p1_Sample.docx', 'p1_Sample.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/topics_covered_in_Year_12.docx', 'topics_covered_in_Year_12.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/P2_Sample.pdf', 'P2_Sample.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/maraking.docx', 'maraking.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/IO.mp3', 'IO.mp3'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/image.docx', 'image.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/_marking.docx', '_marking.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/p1_Sample__2_.pdf', 'p1_Sample__2_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/Text.pdf', 'Text.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Arabic/IO_(1).mp3', 'IO_(1).mp3'),
  ('PADLET IMPORT - COMPRESSED/College_Counseling/Uni_Acceptance_Timeline_YR10_13_Check_Off_Exercise.pdf', 'Uni_Acceptance_Timeline_YR10_13_Check_Off_Exercise.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Geography/Article__Migration.docx', 'Article__Migration.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Geography/Year12_Geography_Key_Resource_Pack.docx', 'Year12_Geography_Key_Resource_Pack.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Geography/27th_Sept_Final__12__Geo__September_2024_(1).docx', '27th_Sept_Final__12__Geo__September_2024_(1).docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Geography/27th_Sept_Final__12__Geo__September_2024.docx', '27th_Sept_Final__12__Geo__September_2024.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Geography/Worksheet__nigeriamigration.pdf', 'Worksheet__nigeriamigration.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Geography/Sample_chapter_Migration___24th_Sept.pptx', 'Sample_chapter_Migration___24th_Sept.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Geography/Year12_Geography_Course_Outline.docx', 'Year12_Geography_Course_Outline.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Geography/IB_DP_Geography_IA_Fieldwork__Internal_Assessment____Umm_Al_Quwain_Mangroves_2025_26__1_.pptx', 'IB_DP_Geography_IA_Fieldwork__Internal_Assessment____Umm_Al_Quwain_Mangroves_2025_26__1_.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Geography/Sample_EE_Geo_Extended_Essay.pdf', 'Sample_EE_Geo_Extended_Essay.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Geography/Shanghai___Coping_with_Megacity_Status_25__3_.pdf', 'Shanghai___Coping_with_Megacity_Status_25__3_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Geography/Sample_GeoIA_Final.pdf', 'Sample_GeoIA_Final.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Spanish_Ab/Ab_Initio_course_overview_Class_of_28.docx', 'Ab_Initio_course_overview_Class_of_28.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Spanish_Ab/Lesson_2_Programme_overview.pptx', 'Lesson_2_Programme_overview.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Spanish_Ab/Y11_to_Y12_Spanish.pdf', 'Y11_to_Y12_Spanish.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_ESS/Bird_Island___Investigating_biodiversity.docx', 'Bird_Island___Investigating_biodiversity.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_ESS/Example_IA_for_ESS.docx', 'Example_IA_for_ESS.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_ESS/Climate_resillience_article.docx', 'Climate_resillience_article.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_ESS/Y12_Topic_1_1_and_6_1_HL.docx', 'Y12_Topic_1_1_and_6_1_HL.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_ESS/ESS_Curriculm_Map_for_Year_12.png', 'ESS_Curriculm_Map_for_Year_12.png'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_ESS/Topic_2_textbook_sample.pdf', 'Topic_2_textbook_sample.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_ESS/ESS_IA_marking_Rubric.docx', 'ESS_IA_marking_Rubric.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_HL/Revision_List_and_video_links_for_AIHL__1_.docx', 'Revision_List_and_video_links_for_AIHL__1_.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_HL/IA_Sample.pdf', 'IA_Sample.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_HL/AIHL_Group_5__DP_Subject_Outline_Mathematics__5_.docx', 'AIHL_Group_5__DP_Subject_Outline_Mathematics__5_.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_HL/Math_IA_Rubric__1___1____Copy.docx', 'Math_IA_Rubric__1___1____Copy.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_HL/Graph_Theory__3_.pptx', 'Graph_Theory__3_.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_HL/Week_3__Differential_Calculus_updated__1_.pptx', 'Week_3__Differential_Calculus_updated__1_.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_HL/AIHL_Paper_1.pdf', 'AIHL_Paper_1.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_HL/AIHL_Paper_2.pdf', 'AIHL_Paper_2.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_HL/_MAA_1_2_1_3__ARITHMETIC_SEQUENCES__1___2_.pdf', '_MAA_1_2_1_3__ARITHMETIC_SEQUENCES__1___2_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_HL/Integration_Extra_Practice.pdf', 'Integration_Extra_Practice.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Global_Politics/Global_Politics_Course_outline_for_Year_12.docx', 'Global_Politics_Course_outline_for_Year_12.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Global_Politics/GP__Sample_Summative_Assessment__Paper_1.docx', 'GP__Sample_Summative_Assessment__Paper_1.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Global_Politics/GLOBAL_POLITICS_IA_02_EN.pdf', 'GLOBAL_POLITICS_IA_02_EN.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Global_Politics/GP_Internal_assessment_SL_criteria.docx', 'GP_Internal_assessment_SL_criteria.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Global_Politics/GP_Internal_assessment_HL_criteria.docx', 'GP_Internal_assessment_HL_criteria.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Global_Politics/GP_Textbook_and_reference_book.docx', 'GP_Textbook_and_reference_book.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Global_Politics/GP__Textbook_Chapter_excerpt.pdf', 'GP__Textbook_Chapter_excerpt.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Global_Politics/EE_glopo_exampleC_en_30.pdf', 'EE_glopo_exampleC_en_30.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Global_Politics/DP_Global_Politics__Framework_of_the_Extended_Essay___InThinking.pdf', 'DP_Global_Politics__Framework_of_the_Extended_Essay___InThinking.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Global_Politics/GP__Article_for_reading_task.docx', 'GP__Article_for_reading_task.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Global_Politics/GP_useful_resources_for_reference.docx', 'GP_useful_resources_for_reference.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Global_Politics/GP_Framing_global_politics__1_1__Workbook.pdf', 'GP_Framing_global_politics__1_1__Workbook.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Sports_Science/Cool_Down_With_Reciprocal_and_Autogenic_Inhibition_Techniques___IDEA_Health___Fitness_Association.pdf', 'Cool_Down_With_Reciprocal_and_Autogenic_Inhibition_Techniques___IDEA_Health___Fitness_Association.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Sports_Science/IA_Rubric.pdf', 'IA_Rubric.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Sports_Science/Summative_Assessment_Example__HL_.pdf', 'Summative_Assessment_Example__HL_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Sports_Science/Summative_Assessment_Example__SL_.pdf', 'Summative_Assessment_Example__SL_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Sports_Science/SEHS_EE_Example.pdf', 'SEHS_EE_Example.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Sports_Science/SEHS_IA_Example.pdf', 'SEHS_IA_Example.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Sports_Science/Topics_Covered_in_Year_12.pdf', 'Topics_Covered_in_Year_12.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Sports_Science/B_1_3_Muscular_Function_Textbook.pdf', 'B_1_3_Muscular_Function_Textbook.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_1_-_English_A/Paper_1_SAMPLE___19.pdf', 'Paper_1_SAMPLE___19.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_1_-_English_A/Teaaching___Learning_resource_PEAEA_example.pdf', 'Teaaching___Learning_resource_PEAEA_example.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_1_-_English_A/Paper_2_SAMPLE___28.pdf', 'Paper_2_SAMPLE___28.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_1_-_English_A/Individual_Oral_SAMPLE_stimuli_for_chosen_texts.pdf', 'Individual_Oral_SAMPLE_stimuli_for_chosen_texts.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_1_-_English_A/RUBRICS_A4_Landscape_ALL_Assessments__1_.pdf', 'RUBRICS_A4_Landscape_ALL_Assessments__1_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_1_-_English_A/language_a_language_and_literature_guide_first_assessment_20_en_5a2dcae3_67fb_4e5d_8abc_f840e46fc0be.pdf', 'language_a_language_and_literature_guide_first_assessment_20_en_5a2dcae3_67fb_4e5d_8abc_f840e46fc0be.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_1_-_English_A/Higher_Level_Essay_SAMPLE__17.pdf', 'Higher_Level_Essay_SAMPLE__17.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_1_-_English_A/Individual_Oral_comments_by_teacher_SAMPLE.pdf', 'Individual_Oral_comments_by_teacher_SAMPLE.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_1_-_English_A/Learner_Portfolio_entry_example.pdf', 'Learner_Portfolio_entry_example.pdf'),
  ('PADLET IMPORT - COMPRESSED/Islamic_B/Y13_Unit1.pdf', 'Y13_Unit1.pdf'),
  ('PADLET IMPORT - COMPRESSED/Islamic_B/Year_13_Islamic_B_topics_and_Scheme_of_work.docx', 'Year_13_Islamic_B_topics_and_Scheme_of_work.docx'),
  ('PADLET IMPORT - COMPRESSED/Islamic_B/Year_13_Exam_Jan_26.pdf', 'Year_13_Exam_Jan_26.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_6_-_Visual_Arts/dp_visual_arts_tsm_preparing_for_digital_assessment.pdf', 'dp_visual_arts_tsm_preparing_for_digital_assessment.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_6_-_Visual_Arts/dp_visual_arts_tsm_summary_poster_en.pdf', 'dp_visual_arts_tsm_summary_poster_en.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_6_-_Visual_Arts/AIP_Sample_14_.pdf', 'AIP_Sample_14_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_6_-_Visual_Arts/dp_vis_arts_subjectbrief_en_1.pdf', 'dp_vis_arts_subjectbrief_en_1.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_6_-_Visual_Arts/dp_visual_arts_assessment_criteria_en.pdf', 'dp_visual_arts_assessment_criteria_en.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_6_-_Visual_Arts/SRA_Sample_14.pdf', 'SRA_Sample_14.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Economics/Introduction_to_Economics.pptx', 'Introduction_to_Economics.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Economics/Exemplar_Economics_IA.pdf', 'Exemplar_Economics_IA.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Economics/how_to_write_the_ia.pdf', 'how_to_write_the_ia.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Economics/Alia_Abdelhamid_002730_0160_kcn791_Economics_IA__4___1_.pdf', 'Alia_Abdelhamid_002730_0160_kcn791_Economics_IA__4___1_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Economics/Summative_1.pdf', 'Summative_1.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Economics/Activity_1_Think_Pair_Share.docx', 'Activity_1_Think_Pair_Share.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Economics/Criteria_Descriptors___IA.docx', 'Criteria_Descriptors___IA.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Economics/Topics_for_year_12.docx', 'Topics_for_year_12.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Economics/Article_on_rent_controls_in_Berlin.docx', 'Article_on_rent_controls_in_Berlin.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French_Ab/Question_types_Paper_1_and_paper_2__Ab_initio_.pdf', 'Question_types_Paper_1_and_paper_2__Ab_initio_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French_Ab/Chapitre_1_Workbook_Je_me_presente.pdf', 'Chapitre_1_Workbook_Je_me_presente.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French_Ab/1st_Formative_assessment_Y12AB_initio_Speaking.docx', '1st_Formative_assessment_Y12AB_initio_Speaking.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French_Ab/Success_Criteria_Oral_and_Writing.pptx', 'Success_Criteria_Oral_and_Writing.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French_Ab/Y12_Ab_initio_Overview.docx', 'Y12_Ab_initio_Overview.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French_Ab/french_ab_initio_writing_formats_booklet_v2__1___1_.pdf', 'french_ab_initio_writing_formats_booklet_v2__1___1_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_SL/Y12_AISL_SA1_Sep_25_Resit.docx', 'Y12_AISL_SA1_Sep_25_Resit.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_SL/IA_Official_Rubric.pdf', 'IA_Official_Rubric.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_SL/Orange_Book_Chapter_5___AFL.pptx', 'Orange_Book_Chapter_5___AFL.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_SL/AISL_Prior_knowledge_Revision_List_and_video_links.docx', 'AISL_Prior_knowledge_Revision_List_and_video_links.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_SL/Orange_Book_Chapter_5___Review_sets.pdf', 'Orange_Book_Chapter_5___Review_sets.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_SL/Scheme_Of_Work.xlsx', 'Scheme_Of_Work.xlsx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_SL/Orange_Book_Chapter_5___Bivariate_statistics.pdf', 'Orange_Book_Chapter_5___Bivariate_statistics.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_SL/IA_Marking_Checklist.pdf', 'IA_Marking_Checklist.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AI_SL/IA_Example.pdf', 'IA_Example.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Digital_Societies/Sample_lesson_presentation.pdf', 'Sample_lesson_presentation.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Digital_Societies/Digital_Society__EE_sample__A_grade_.pdf', 'Digital_Society__EE_sample__A_grade_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Digital_Societies/Chapter_Outline.docx', 'Chapter_Outline.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Digital_Societies/IA__Presentation__1_.pdf', 'IA__Presentation__1_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Digital_Societies/DS_Year_11_going_to_DP1.pdf', 'DS_Year_11_going_to_DP1.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Digital_Societies/Sample_Assessment__Paper_1.pdf', 'Sample_Assessment__Paper_1.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Chemistry/S1_1_Introduction_to_the_particulate_nature_of_matter.pptx', 'S1_1_Introduction_to_the_particulate_nature_of_matter.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Chemistry/Nour__Merad_002730_0055_krg724_EE_Chemistry_ND.pdf', 'Nour__Merad_002730_0055_krg724_EE_Chemistry_ND.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Chemistry/2024_2025_SL___HL_Actual_Error__Uncert__Sig_Fig_Test_MS_23__docx.pdf', '2024_2025_SL___HL_Actual_Error__Uncert__Sig_Fig_Test_MS_23__docx.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Chemistry/DP_Chemistry_IA_Rubric_FA2025_.pdf', 'DP_Chemistry_IA_Rubric_FA2025_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Chemistry/2024_2025_SL___HL_Actual_Error__Uncert__Sig_Fig_Test.pdf', '2024_2025_SL___HL_Actual_Error__Uncert__Sig_Fig_Test.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Chemistry/Prisha_Jani_002730_0047_kcn679_CHEM_IA.pdf', 'Prisha_Jani_002730_0047_kcn679_CHEM_IA.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Chemistry/S1_1___S1_4_SL___HL_Test_2024_MS_docx.pdf', 'S1_1___S1_4_SL___HL_Test_2024_MS_docx.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Chemistry/S1_1_Introduction_to_the_particulate_nature_of_matter_Pearson_Textbook.pdf', 'S1_1_Introduction_to_the_particulate_nature_of_matter_Pearson_Textbook.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Chemistry/S1_1___S1_4_SL___HL_Test_2024.pdf', 'S1_1___S1_4_SL___HL_Test_2024.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Chemistry/Subject_Outline___CHEM_12.docx', 'Subject_Outline___CHEM_12.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/First_chapter_excerpt.pdf', 'First_chapter_excerpt.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Data_study__Popular_hobbies_among_young_people_in_France.png', 'Data_study__Popular_hobbies_among_young_people_in_France.png'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Recording_(1).mp3', 'Recording_(1).mp3'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Internal_evaluation_HL.pdf', 'Internal_evaluation_HL.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Extended_Essay___sample.pdf', 'Extended_Essay___sample.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Teacher_s_comments_(1).pdf', 'Teacher_s_comments_(1).pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/French_B_listening_comprehension__SL_markscheme_French_done_in_DP_Taster.pdf', 'French_B_listening_comprehension__SL_markscheme_French_done_in_DP_Taster.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Recording.mp3', 'Recording.mp3'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/DP1_French_SL_course_outline_2025_2026.pdf', 'DP1_French_SL_course_outline_2025_2026.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Speaking_worksheet___practice_in_class.docx', 'Speaking_worksheet___practice_in_class.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Audio_C.mp3', 'Audio_C.mp3'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Audio_B.mp3', 'Audio_B.mp3'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Audio_A.mp3', 'Audio_A.mp3'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Stimulus.pdf', 'Stimulus.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Internal_evaluation_SL.pdf', 'Internal_evaluation_SL.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Teacher_s_comments.pdf', 'Teacher_s_comments.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/French_B_listening_comprehension_The_mes_varie_s_done_in_DP_Taster.pdf', 'French_B_listening_comprehension_The_mes_varie_s_done_in_DP_Taster.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_French/Extract_from___la_tresse__.pdf', 'Extract_from___la_tresse__.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Business_Management/Topic_List__EOY__Year_12.pdf', 'Topic_List__EOY__Year_12.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Business_Management/Omar_Tayyem_002730_0178_kks746_Business_EE.pdf', 'Omar_Tayyem_002730_0178_kks746_Business_EE.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Business_Management/Aryan_Misra_002730_0080_jqk341_Final_Extended_Essay.pdf', 'Aryan_Misra_002730_0080_jqk341_Final_Extended_Essay.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Business_Management/Drafting_an_IA__Step_By_Step.pdf', 'Drafting_an_IA__Step_By_Step.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Business_Management/IA_extract_from_syllabus__2___1_.pdf', 'IA_extract_from_syllabus__2___1_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Business_Management/Sample_HL_Business_IA.pdf', 'Sample_HL_Business_IA.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Business_Management/Year_12__1st_Summative_Test.pdf', 'Year_12__1st_Summative_Test.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Business_Management/DP_Student_workbook_.pdf', 'DP_Student_workbook_.pdf'),
  ('PADLET IMPORT - COMPRESSED/DP_Core/Archa_Arun_Cheriyan_002730_0001_Ifv134_EE_LC.pdf', 'Archa_Arun_Cheriyan_002730_0001_Ifv134_EE_LC.pdf'),
  ('PADLET IMPORT - COMPRESSED/DP_Core/Y12_Extended_Essay_Handbook_for_Students.pptx', 'Y12_Extended_Essay_Handbook_for_Students.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/Sample_EE_History_Extended_Essay.pdf', 'Sample_EE_History_Extended_Essay.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/5__How_to_write_Section_3_of_your_IB_History_IA.pdf', '5__How_to_write_Section_3_of_your_IB_History_IA.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/History_IA_feedback.docx', 'History_IA_feedback.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/Comparing_and_contrasting__effects_of_civil_wars.docx', 'Comparing_and_contrasting__effects_of_civil_wars.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/2__How_to_research_your_IB_History_IA.pdf', '2__How_to_research_your_IB_History_IA.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/Evaluation_of_the_argument_for_Paper_2_and_3.pptx', 'Evaluation_of_the_argument_for_Paper_2_and_3.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/DP_1__History_Summative_Assessment___1_30th_Sept_2025.docx', 'DP_1__History_Summative_Assessment___1_30th_Sept_2025.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/4__Section_2__The_Investigation__worth_15_marks_out_of_25_.pdf', '4__Section_2__The_Investigation__worth_15_marks_out_of_25_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/1__Tips_for_picking_an_IB_History_IA_title.pdf', '1__Tips_for_picking_an_IB_History_IA_title.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/IA_booklet.docx', 'IA_booklet.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/Comparing_and_Contrasting_the_Causes_of_Civil_Wars.pdf', 'Comparing_and_Contrasting_the_Causes_of_Civil_Wars.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/P3__Weimar_Republic.docx', 'P3__Weimar_Republic.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/Revision_table_of_20th_century_wars_WWI_Pacific_war.docx', 'Revision_table_of_20th_century_wars_WWI_Pacific_war.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/DP_1_History_Curriculum_Overview_2025_26.docx', 'DP_1_History_Curriculum_Overview_2025_26.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/3__How_to_write_Section_1_of_your_IB_History_IA.pdf', '3__How_to_write_Section_1_of_your_IB_History_IA.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/Knowledge_test_on_Japan.docx', 'Knowledge_test_on_Japan.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/UNIT_3_JAPANESE_EXPANSION__1931_1941__revision_guide.docx', 'UNIT_3_JAPANESE_EXPANSION__1931_1941__revision_guide.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/Comapring_and_contrasting_foreign_involvement_civil_wars_revision.docx', 'Comapring_and_contrasting_foreign_involvement_civil_wars_revision.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_History/UNIT_5_Italian_and_German_EXPANSION__1931_1941__revision_guide.docx', 'UNIT_5_Italian_and_German_EXPANSION__1931_1941__revision_guide.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Physics/EE_Final.pdf', 'EE_Final.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Physics/A1_Notes.pdf', 'A1_Notes.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Physics/MS_SA1_Y12_G3_HL___SL.pdf', 'MS_SA1_Y12_G3_HL___SL.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Physics/Ibdp_Physics_Measurement_Uncertainties_Worksheet.pdf', 'Ibdp_Physics_Measurement_Uncertainties_Worksheet.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Physics/Aaron_Pinto.pdf', 'Aaron_Pinto.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Physics/QP_SA1_Y12_G3_HL___SL.pdf', 'QP_SA1_Y12_G3_HL___SL.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Physics/IA_Checklist_for_2025_Syllabus.pdf', 'IA_Checklist_for_2025_Syllabus.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Physics/A_1_Kinematics_SL.pptx', 'A_1_Kinematics_SL.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Physics/IB_Physics__2025_Subject_Guide.pdf', 'IB_Physics__2025_Subject_Guide.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/Review_Checklist_for_review_writing.odt', 'Review_Checklist_for_review_writing.odt'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/IO_Feedback_Form_Y12_Eng_B_HL___Enzo_Peters.docx', 'IO_Feedback_Form_Y12_Eng_B_HL___Enzo_Peters.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/Fact_finding_Task_journalist_Dp1.odt', 'Fact_finding_Task_journalist_Dp1.odt'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/Oral_Assessment_Question_Bank__IO.odt', 'Oral_Assessment_Question_Bank__IO.odt'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/Diary_entry_DP1.odt', 'Diary_entry_DP1.odt'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/Task_1__Listening_Comprehension_Speech_Mamdani.odt', 'Task_1__Listening_Comprehension_Speech_Mamdani.odt'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/IO_Feedback_Form_Y12_Eng_B_HL_Jonathan_Petrellese.docx', 'IO_Feedback_Form_Y12_Eng_B_HL_Jonathan_Petrellese.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/Comparing_Perspectives_on_Migration.odt', 'Comparing_Perspectives_on_Migration.odt'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/Guiding_questions_conceptual_exploratory_questions.odt', 'Guiding_questions_conceptual_exploratory_questions.odt'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/DP_Writing_Assessment_Criteria.pdf', 'DP_Writing_Assessment_Criteria.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/IO_Feedback_Form_Y12_Eng_B_HL___Rose_Madani.docx', 'IO_Feedback_Form_Y12_Eng_B_HL___Rose_Madani.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/English_specimen___nov_2020_exam_new.pdf', 'English_specimen___nov_2020_exam_new.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/All_My_Sons_Extracts.pdf', 'All_My_Sons_Extracts.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/The_6_Pillars_of_Lifestyle_Reading.odt', 'The_6_Pillars_of_Lifestyle_Reading.odt'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_English_B/Year_12_English_B_HL_Course_Outline.odt', 'Year_12_English_B_HL_Course_Outline.odt'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Design_Technology/DT_Theory_Topics_Guidance_2025_27__2_.pdf', 'DT_Theory_Topics_Guidance_2025_27__2_.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Design_Technology/A1_1___Flashcards.pdf', 'A1_1___Flashcards.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Design_Technology/A1_1___Questions.pdf', 'A1_1___Questions.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Design_Technology/DT_EE_IB_Sample_Assessment_and_Comments.pdf', 'DT_EE_IB_Sample_Assessment_and_Comments.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Design_Technology/Design_Technology_Specific_EE_Guidance.pdf', 'Design_Technology_Specific_EE_Guidance.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Design_Technology/DT_IA_Example_1_Crit_A_Empathise__Assessment.pdf', 'DT_IA_Example_1_Crit_A_Empathise__Assessment.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Design_Technology/DT_IA_Example_1_Crit_A_Empathise.pdf', 'DT_IA_Example_1_Crit_A_Empathise.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Design_Technology/DT_EE_IB_Sample_Student_work.pdf', 'DT_EE_IB_Sample_Student_work.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Design_Technology/DT_EE_IB_Sample_Reflection_Form.pdf', 'DT_EE_IB_Sample_Reflection_Form.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Design_Technology/DT_IA_Assessment_Criteria_Descriptors.pdf', 'DT_IA_Assessment_Criteria_Descriptors.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Design_Technology/DP_DT_HL_SL_Course_Outline.pdf', 'DP_DT_HL_SL_Course_Outline.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Design_Technology/A1_1___Ergonomics.pdf', 'A1_1___Ergonomics.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Biology/Topic_A2_2_Cell_structure_SL.pptx', 'Topic_A2_2_Cell_structure_SL.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Biology/History_of_life_on_earth_reading_interactive.docx', 'History_of_life_on_earth_reading_interactive.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Biology/A_2_2_cell_structure_SL_student_notes.pdf', 'A_2_2_cell_structure_SL_student_notes.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Biology/Biology_Internal_assessment_Criteria.pdf', 'Biology_Internal_assessment_Criteria.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Biology/Y12_Biology_topics.docx', 'Y12_Biology_topics.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Biology/Example_IA.pdf', 'Example_IA.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Biology/Signs_of_life_article.docx', 'Signs_of_life_article.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Biology/Summative_assessment_example.docx', 'Summative_assessment_example.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Biology/A_2_2_cell_structure_AHL_student_notes.pdf', 'A_2_2_cell_structure_AHL_student_notes.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Biology/Biology_Extended_essay_sample.pdf', 'Biology_Extended_essay_sample.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Spanish/DPSLHL_ORAL_GUIDE_May26.pptx', 'DPSLHL_ORAL_GUIDE_May26.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Spanish/SPAB_SLHL_SUMMER_PACK_2026.pptx', 'SPAB_SLHL_SUMMER_PACK_2026.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_2_-_Spanish/DP1_SPANISH_B_PROGRAMME_OVERVIEW.pptx', 'DP1_SPANISH_B_PROGRAMME_OVERVIEW.pptx'),
  ('PADLET IMPORT - COMPRESSED/Academic_Pathways/DP_Handbook_2526_v2.pdf', 'DP_Handbook_2526_v2.pdf'),
  ('PADLET IMPORT - COMPRESSED/Academic_Pathways/IB_CP_Handbook_2526_2.pdf', 'IB_CP_Handbook_2526_2.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_HL/WS_Binomial_Expansion___Hard.pdf', 'WS_Binomial_Expansion___Hard.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_HL/Sample_IA___Microwavepopcorn.pdf', 'Sample_IA___Microwavepopcorn.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_HL/Y12_AAHL_Curriculum_Outline_26_27.xlsx', 'Y12_AAHL_Curriculum_Outline_26_27.xlsx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_HL/Sample_Summative_Paper.pdf', 'Sample_Summative_Paper.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_HL/AAHL_Binomial_Expansion_PPT.pptx', 'AAHL_Binomial_Expansion_PPT.pptx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_HL/WS_Binomial_Expansion___Easy.pdf', 'WS_Binomial_Expansion___Easy.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_HL/WS_Binomial_Expansion___Medium.pdf', 'WS_Binomial_Expansion___Medium.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_HL/IA_Specific_MAA_Curriculum_Guide.pdf', 'IA_Specific_MAA_Curriculum_Guide.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_HL/AAHL_Prior_knowledge_revision_Links.docx', 'AAHL_Prior_knowledge_revision_Links.docx'),
  ('PADLET IMPORT - COMPRESSED/BTEC/Lesson_1___Research_and_citation_task.docx', 'Lesson_1___Research_and_citation_task.docx'),
  ('PADLET IMPORT - COMPRESSED/BTEC/Unit_1_Exploring_Business_Assignment_1___Final_.docx', 'Unit_1_Exploring_Business_Assignment_1___Final_.docx'),
  ('PADLET IMPORT - COMPRESSED/BTEC/Unit_1___Assignment_1___Feedback_GD___Abigail_Tak.docx', 'Unit_1___Assignment_1___Feedback_GD___Abigail_Tak.docx'),
  ('PADLET IMPORT - COMPRESSED/BTEC/Unit_1_Exploring_Business.pdf', 'Unit_1_Exploring_Business.pdf'),
  ('PADLET IMPORT - COMPRESSED/BTEC/Unit_9___Spec.pdf', 'Unit_9___Spec.pdf'),
  ('PADLET IMPORT - COMPRESSED/BTEC/Unit_23_Work_Experience_in_Business.pdf', 'Unit_23_Work_Experience_in_Business.pdf'),
  ('PADLET IMPORT - COMPRESSED/BTEC/Lesson_1___Ownership.pptx', 'Lesson_1___Ownership.pptx'),
  ('PADLET IMPORT - COMPRESSED/BTEC/BTEC_2019_Specification_Unit_8.pdf', 'BTEC_2019_Specification_Unit_8.pdf'),
  ('PADLET IMPORT - COMPRESSED/Islamic_A/_____________1_8.docx', '_____________1_8.docx'),
  ('PADLET IMPORT - COMPRESSED/Islamic_A/____________.pdf', '____________.pdf'),
  ('PADLET IMPORT - COMPRESSED/Islamic_A/Y_11.pdf', 'Y_11.pdf'),
  ('PADLET IMPORT - COMPRESSED/Islamic_A/________________.docx', '________________.docx'),
  ('PADLET IMPORT - COMPRESSED/Islamic_A/__________________.docx', '__________________.docx'),
  ('PADLET IMPORT - COMPRESSED/Islamic_A/Exam_Sample.docx', 'Exam_Sample.docx'),
  ('PADLET IMPORT - COMPRESSED/Islamic_A/Year_13_Islamic_A_topics_and_Scheme_of_work.docx', 'Year_13_Islamic_A_topics_and_Scheme_of_work.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Psychology/Psychology_Sample_Summative_Assessment_1_Questions.docx', 'Psychology_Sample_Summative_Assessment_1_Questions.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Psychology/IA_Sample_of_Each_Section.docx', 'IA_Sample_of_Each_Section.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Psychology/Sample_EE.pdf', 'Sample_EE.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Psychology/IA_Template.pdf', 'IA_Template.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Psychology/IA_Assessment_Rubric.pdf', 'IA_Assessment_Rubric.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Psychology/Ib_Psychology_Six_Concepts_Student_Worksheet.pdf', 'Ib_Psychology_Six_Concepts_Student_Worksheet.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_3_-_Psychology/Yr_12_Psychology_Outline.docx', 'Yr_12_Psychology_Outline.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Computer_Science/Task_sheet.pdf', 'Task_sheet.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Computer_Science/CS_DP1_course_outline.pdf', 'CS_DP1_course_outline.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Computer_Science/Summative_assessment_example.pdf', 'Summative_assessment_example.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Computer_Science/CS_EE.pdf', 'CS_EE.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Computer_Science/CS_DP1__Topic_A1.pdf', 'CS_DP1__Topic_A1.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Computer_Science/DP_Comp_sci_asw_example_6_en.pdf', 'DP_Comp_sci_asw_example_6_en.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Computer_Science/Article_Generative_AI_for_image_creation_a_diffuse_vision.pdf', 'Article_Generative_AI_for_image_creation_a_diffuse_vision.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Computer_Science/IA.pdf', 'IA.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Computer_Science/DP_Comp_sci_asw_video_example_6_en.mp4', 'DP_Comp_sci_asw_video_example_6_en.mp4'),
  ('PADLET IMPORT - COMPRESSED/Group_4_-_Computer_Science/DP_Comp_sci_asw_appendix_example_6_en.pdf', 'DP_Comp_sci_asw_appendix_example_6_en.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_SL/Math_IA_Introduction_and_Success_Criteria.docx', 'Math_IA_Introduction_and_Success_Criteria.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_SL/Math_AASL_2026_2027_SOW_Yr_12.xlsx', 'Math_AASL_2026_2027_SOW_Yr_12.xlsx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_SL/Sample_IA_Zeno_s_Arrow_Paradox.pdf', 'Sample_IA_Zeno_s_Arrow_Paradox.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_SL/Prior_Knowledge_for_AASL.docx', 'Prior_Knowledge_for_AASL.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_SL/Chapter_on_Exponents_and_Logarithms.pdf', 'Chapter_on_Exponents_and_Logarithms.pdf'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_SL/Exponential_Functions_Applications_Long_Questions_HW_Task.docx', 'Exponential_Functions_Applications_Long_Questions_HW_Task.docx'),
  ('PADLET IMPORT - COMPRESSED/Group_5_-_Mathematics_AA_SL/AASL_Sample_Assessment.docx', 'AASL_Sample_Assessment.docx');

create temporary table _dp_padlet_match_audit on commit drop as
with candidates as (
  select archive.archive_path, archive.archive_name, index_row.drive_file_id,
         count(*) over (partition by archive.archive_path) as candidate_count
  from _dp_padlet_archive_files archive
  join public.dp_resource_index index_row
    on not index_row.is_folder
   and regexp_replace(lower(index_row.name), '[^a-z0-9]+', '', 'g')
       = regexp_replace(lower(archive.archive_name), '[^a-z0-9]+', '', 'g')
)
select
  (select count(*) from _dp_padlet_archive_files)::bigint as archive_files,
  count(distinct archive_path) filter (where candidate_count = 1)::bigint as unique_matches,
  count(distinct archive_path) filter (where candidate_count > 1)::bigint as ambiguous_matches,
  ((select count(*) from _dp_padlet_archive_files)
    - count(distinct archive_path))::bigint as unmatched_files
from candidates;

create temporary table _dp_padlet_unique_matches on commit drop as
with candidates as (
  select archive.archive_path, archive.archive_name, index_row.drive_file_id,
         count(*) over (partition by archive.archive_path) as candidate_count
  from _dp_padlet_archive_files archive
  join public.dp_resource_index index_row
    on not index_row.is_folder
   and regexp_replace(lower(index_row.name), '[^a-z0-9]+', '', 'g')
       = regexp_replace(lower(archive.archive_name), '[^a-z0-9]+', '', 'g')
)
select archive_path, archive_name, drive_file_id
from candidates
where candidate_count = 1;

create temporary table _dp_padlet_protected_counts on commit drop as
select
  (select count(*) from public.dp_qb_questions) as question_cores,
  (select count(*) from public.dp_qb_question_variants) as variants,
  (select count(*) from public.dp_qb_assets) as assets,
  (select count(*) from public.dp_qb_solution_videos) as solution_videos,
  (select count(*) from public.dp_qb_user_progress) as progress_rows,
  (select count(*) from public.dp_qb_user_saved_questions) as saved_rows,
  (select count(*) from public.dp_resource_index) as resource_index_rows,
  (select count(*) from public.dp_resource_source_assignments) as resource_source_rows;

do $$
declare
  v_version constant text := 'padlet_archive_hosting_evidence_v1';
  v_archive_sha256 constant text := '911a6bfa097e47ce060b6dfcb9cf15f12de1f3b76f8f7b2134b699d010cd541b';
  v_listing_sha256 constant text := '75e98c1a8f2969168fc3b631ca30bc89e93bfe46aa27646737dea1eea889f2d5';
  v_padlet_source_id uuid;
  v_match_audit record;
  v_existing_rows bigint;
  v_inserted_rows bigint;
begin
  select * into strict v_match_audit from _dp_padlet_match_audit;
  if v_match_audit.archive_files <> 269
     or v_match_audit.unique_matches <> 239
     or v_match_audit.ambiguous_matches <> 2
     or v_match_audit.unmatched_files <> 28
     or (select count(distinct drive_file_id) from _dp_padlet_unique_matches) <> 239 then
    raise exception 'Padlet archive-to-Library match boundary changed: %', to_jsonb(v_match_audit);
  end if;

  select source.id into strict v_padlet_source_id
  from public.dp_content_sources source
  where source.slug = 'padlet' and source.is_active;

  select count(*) into v_existing_rows
  from public.dp_resource_source_assignments assignment
  join _dp_padlet_unique_matches matched
    on matched.drive_file_id = assignment.drive_file_id
  where assignment.source_id = v_padlet_source_id
    and assignment.assignment_method = 'import_manifest'
    and assignment.relationship = 'hosted_from'
    and assignment.review_status = 'reviewed'
    and assignment.backfill_version = v_version;

  if v_existing_rows = 239 then
    return;
  end if;

  if v_existing_rows <> 0
     or exists (
       select 1
       from public.dp_resource_source_assignments assignment
       join _dp_padlet_unique_matches matched
         on matched.drive_file_id = assignment.drive_file_id
       where assignment.source_id = v_padlet_source_id
         and assignment.review_status <> 'rejected'
     ) then
    raise exception 'Unexpected pre-existing Padlet assignments overlap the reviewed archive matches';
  end if;

  insert into public.dp_resource_source_assignments (
    drive_file_id, source_id, is_primary, relationship, assignment_method,
    confidence, inherited_from_drive_file_id, review_status,
    applies_to_descendants, resolution_version, backfill_version,
    last_resolved_at, created_by, updated_at
  )
  select matched.drive_file_id, v_padlet_source_id, false, 'hosted_from',
         'import_manifest', 1, null, 'reviewed', false, v_version, v_version,
         now(), null, now()
  from _dp_padlet_unique_matches matched
  on conflict (
    drive_file_id, source_id, assignment_method,
    (coalesce(inherited_from_drive_file_id, ''::text)), relationship
  ) do update set
    is_primary = false,
    confidence = 1,
    review_status = 'reviewed',
    applies_to_descendants = false,
    resolution_version = excluded.resolution_version,
    backfill_version = excluded.backfill_version,
    last_resolved_at = now(),
    updated_at = now();
  get diagnostics v_inserted_rows = row_count;

  if v_inserted_rows <> 239
     or (select count(*)
         from public.dp_resource_source_assignments assignment
         join _dp_padlet_unique_matches matched
           on matched.drive_file_id = assignment.drive_file_id
         where assignment.source_id = v_padlet_source_id
           and assignment.is_primary is false
           and assignment.relationship = 'hosted_from'
           and assignment.assignment_method = 'import_manifest'
           and assignment.review_status = 'reviewed'
           and assignment.backfill_version = v_version) <> 239 then
    raise exception 'Padlet hosted-from assignment verification failed';
  end if;

  insert into public.dp_content_source_audit_log (
    target_kind, target_id, action, before_state, after_state, change_version
  ) values (
    'resource_library_archive', 'PADLET IMPORT - COMPRESSED.zip',
    'evidence_source_backfill',
    jsonb_build_object(
      'archiveFiles', 269,
      'uniqueLibraryMatches', 239,
      'ambiguousArchiveFilesExcluded', 2,
      'unmatchedArchiveFilesExcluded', 28,
      'existingPadletMatches', 0
    ),
    jsonb_build_object(
      'sourceSlug', 'padlet',
      'relationship', 'hosted_from',
      'isPrimary', false,
      'reviewedAssignments', 239,
      'archiveSha256', v_archive_sha256,
      'archiveListingSha256', v_listing_sha256
    ),
    v_version
  );
end;
$$;

do $$
declare
  v_before record;
begin
  select * into strict v_before from _dp_padlet_protected_counts;
  if v_before.question_cores <> (select count(*) from public.dp_qb_questions)
     or v_before.variants <> (select count(*) from public.dp_qb_question_variants)
     or v_before.assets <> (select count(*) from public.dp_qb_assets)
     or v_before.solution_videos <> (select count(*) from public.dp_qb_solution_videos)
     or v_before.progress_rows <> (select count(*) from public.dp_qb_user_progress)
     or v_before.saved_rows <> (select count(*) from public.dp_qb_user_saved_questions)
     or v_before.resource_index_rows <> (select count(*) from public.dp_resource_index)
     or (select count(*) from public.dp_resource_source_assignments)
        not in (v_before.resource_source_rows, v_before.resource_source_rows + 239) then
    raise exception 'Protected content or user-state changed during Padlet source review';
  end if;
end;
$$;

analyze public.dp_resource_source_assignments;
